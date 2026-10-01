import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreateCampaignPage from './CreateCampaignPage.jsx'
import { loadCampaignCategories } from '../services/campaignSubmissionService.js'
import { validateCampaignSubmission } from '../services/campaignSubmissionValidation.js'

const categories = [{ id: 7, name: 'Local action' }, { id: 12, name: 'Education' }]
const values = {
  title: 'Neighbourhood garden',
  description: 'Help plant and care for a shared garden.',
  categoryId: '7',
  targetAudience: '',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
}
const saved = { campaign: { id: 42, title: values.title, status: 'pending' } }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const submitButton = () => screen.getByRole('button', { name: 'Submit campaign for review' })

async function readyForm() {
  await screen.findByRole('option', { name: 'Local action' })
  for (const [label, value] of Object.entries({
    'Campaign title': values.title,
    Description: values.description,
    Category: values.categoryId,
    'Start date': values.startDate,
    'End date': values.endDate,
  })) fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ categories })))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Campaign submission', () => {
  it('loads the public campaign form and optional photo field', async () => {
    render(<CreateCampaignPage />)
    await readyForm()
    expect(screen.getByRole('heading', { name: 'Create a campaign' })).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/categories', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(screen.queryByLabelText('Sample account')).toBeNull()
    expect(screen.getByLabelText(/Campaign photo/)).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('asks guests to log in without loading categories or showing a form', () => {
    localStorage.removeItem('token')
    render(<CreateCampaignPage />)
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Create campaign' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('disables submission while categories load, then sends only editable fields and the token', async () => {
    fetch.mockResolvedValueOnce(json(saved, 201))
    render(<CreateCampaignPage />)
    expect(submitButton().disabled).toBe(true)
    await readyForm()
    fireEvent.change(screen.getByLabelText('Campaign title'), { target: { value: `  ${values.title}  ` } })
    fireEvent.change(screen.getByLabelText(/Target audience/), { target: { value: '  Local residents  ' } })
    fireEvent.click(submitButton())
    expect(await screen.findByRole('heading', { name: 'Campaign submitted' })).toBeTruthy()
    const [url, options] = fetch.mock.calls[1]
    expect(url).toBe('/api/campaigns')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token', 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body)).toEqual({ ...values, categoryId: 7, targetAudience: 'Local residents' })
    expect(screen.getByText(/saved as campaign #42/)).toBeTruthy()
    expect(screen.getByText('Status: pending review. It is not publicly visible yet.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('status'))
    expect(document.querySelector('a[href="/campaigns/42"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create another campaign' }))
    expect(screen.getByLabelText('Campaign title').value).toBe('')
  })

  it('omits an empty optional audience and blocks a second submit while the request is pending', async () => {
    let resolvePost
    fetch.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve }))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.submit(screen.getByRole('form'))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('targetAudience')
    expect(screen.getByRole('button', { name: 'Submitting…' }).disabled).toBe(true)
    expect(screen.getByLabelText('Campaign title').closest('fieldset').disabled).toBe(true)
    await act(async () => { resolvePost(json(saved, 201)) })
    expect(screen.getByRole('heading', { name: 'Campaign submitted' })).toBeTruthy()
  })

  it('shows required field errors and focuses the first invalid field without posting', async () => {
    render(<CreateCampaignPage />)
    await screen.findByRole('option', { name: 'Local action' })
    fireEvent.click(submitButton())
    for (const message of ['Title is required.', 'Description is required.', 'Choose an available category.', 'Start date is required.', 'End date is required.']) {
      expect(screen.getByText(message)).toBeTruthy()
    }
    expect(document.activeElement).toBe(screen.getByLabelText('Campaign title'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps entered text when category loading fails and can retry', async () => {
    fetch.mockReset().mockRejectedValueOnce(new TypeError('Network down')).mockResolvedValueOnce(json({ categories }))
    render(<CreateCampaignPage />)
    fireEvent.change(screen.getByLabelText('Campaign title'), { target: { value: values.title } })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(submitButton().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry categories' }))
    await screen.findByRole('option', { name: 'Local action' })
    expect(screen.getByLabelText('Campaign title').value).toBe(values.title)
    expect(submitButton().disabled).toBe(false)
  })

  it('explains an empty category list and prevents posting until categories are available', async () => {
    fetch.mockReset().mockResolvedValueOnce(json({ categories: [] })).mockResolvedValueOnce(json({ categories }))
    render(<CreateCampaignPage />)
    await screen.findByText('No categories are available yet. Please check again later.')
    expect(submitButton().disabled).toBe(true)
    fireEvent.submit(screen.getByRole('form'))
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry categories' }))
    await screen.findByRole('option', { name: 'Local action' })
    expect(submitButton().disabled).toBe(false)
  })

  it.each([
    [401, 'Your session has expired. Please log in again.'],
    [403, 'Only public users can submit social-cause campaigns.'],
  ])('shows the server message for HTTP %s and preserves the form', async (status, message) => {
    fetch.mockResolvedValueOnce(json({ code: 'REQUEST_FAILED', message }, status))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.click(submitButton())
    await screen.findByText(message)
    expect(screen.queryByRole('heading', { name: 'Campaign submitted' })).toBeNull()
    expect(screen.getByLabelText('Campaign title').value).toBe(values.title)
    await waitFor(() => expect(submitButton().disabled).toBe(false))
    expect(Boolean(screen.queryByRole('link', { name: 'Log in again' }))).toBe(status === 401)
  })

  it('shows and focuses server field errors, then allows a corrected submission', async () => {
    fetch.mockResolvedValueOnce(json({ code: 'VALIDATION_ERROR', message: 'Please check the campaign details.', fieldErrors: { categoryId: 'This category is no longer available.' } }, 422))
      .mockResolvedValueOnce(json(saved, 201))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.click(submitButton())
    await screen.findByText('This category is no longer available.')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Category')))
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '12' } })
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { name: 'Campaign submitted' })
    expect(JSON.parse(fetch.mock.calls[2][1].body).categoryId).toBe(12)
  })

  it('warns that a network failure does not prove the campaign was not saved', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Connection lost'))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.click(submitButton())
    await screen.findByText(/could not confirm whether your campaign was saved/)
    expect(screen.queryByRole('heading', { name: 'Campaign submitted' })).toBeNull()
    expect(screen.getByLabelText('Description').value).toBe(values.description)
    expect(submitButton().disabled).toBe(true)
  })

  it.each([
    [201, {}],
    [201, { campaign: { ...saved.campaign, id: '42' } }],
    [201, { campaign: { ...saved.campaign, status: 'approved' } }],
    [201, { campaign: { ...saved.campaign, title: '' } }],
    [200, saved],
  ])('does not claim success for an unexpected %s response: %j', async (status, body) => {
    fetch.mockResolvedValueOnce(json(body, status))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.click(submitButton())
    await screen.findByText(/server did not confirm the saved campaign/)
    expect(screen.queryByRole('heading', { name: 'Campaign submitted' })).toBeNull()
    expect(screen.getByLabelText('Campaign title').value).toBe(values.title)
    expect(submitButton().disabled).toBe(true)
  })

  it('aborts a pending submission on unmount', async () => {
    let resolvePost
    fetch.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve }))
    const view = render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.click(submitButton())
    const signal = fetch.mock.calls[1][1].signal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { resolvePost(json(saved, 201)) })
    expect(screen.queryByText('Campaign submitted')).toBeNull()
  })

  it('ignores a previous session response after the session changes', async () => {
    let resolvePost
    fetch.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve }))
      .mockResolvedValueOnce(json({ categories }))
    const view = render(<CreateCampaignPage token="old-session" />)
    await readyForm()
    fireEvent.click(submitButton())
    view.rerender(<CreateCampaignPage token="new-session" />)
    await waitFor(() => expect(submitButton().disabled).toBe(false))
    await act(async () => { resolvePost(json(saved, 201)) })
    expect(screen.queryByText('Campaign submitted')).toBeNull()
  })

  it('blocks a mismatched role without loading data', () => {
    render(<CreateCampaignPage role="admin" />)
    expect(screen.getByText(/public-user account is needed/)).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires a business profile before allowing business campaign submission', async () => {
    fetch.mockResolvedValueOnce(json({ business: null }))
    render(<CreateCampaignPage mode="business" role="business_owner" />)
    expect(await screen.findByRole('link', { name: 'Set up business profile' })).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('posts a business campaign with no client-selected business, user, type or status', async () => {
    fetch.mockResolvedValueOnce(json({ business: { id: 3, businessName: 'Local shop' } })).mockResolvedValueOnce(json(saved, 201))
    render(<CreateCampaignPage mode="business" role="business_owner" />)
    await screen.findByRole('heading', { name: 'Create a business campaign' })
    await readyForm()
    expect(screen.getByText('Local shop')).toBeTruthy()
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { name: 'Campaign submitted' })
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ title: values.title, description: values.description, categoryId: 7, startDate: values.startDate, endDate: values.endDate })
  })

  it('uploads a photo before posting and reuses it after a field validation failure', async () => {
    fetch.mockResolvedValueOnce(json({ imageId: 'img_123', contentType: 'image/png', sizeBytes: 5, expiresAt: '2099-01-01T00:00:00.000Z' }, 201))
      .mockResolvedValueOnce(json({ message: 'Check details.', fieldErrors: { categoryId: 'Choose another category.' } }, 422))
      .mockResolvedValueOnce(json(saved, 201))
    render(<CreateCampaignPage />)
    await readyForm()
    const file = new File(['photo'], 'garden.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [file] } })
    fireEvent.click(submitButton())
    await screen.findByText('Choose another category.')
    expect(fetch.mock.calls[1][0]).toBe('/api/campaign-images')
    expect(fetch.mock.calls[1][1].body.get('file')).toBe(file)
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('Content-Type')
    expect(JSON.parse(fetch.mock.calls[2][1].body).imageId).toBe('img_123')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '12' } })
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { name: 'Campaign submitted' })
    expect(fetch.mock.calls.filter(([url]) => url === '/api/campaign-images')).toHaveLength(1)
    expect(JSON.parse(fetch.mock.calls[3][1].body).imageId).toBe('img_123')
    expect(screen.getByRole('link', { name: 'My campaigns' }).getAttribute('href')).toBe('/my-campaigns')
  })

  it('preserves the form and does not post the campaign when the image upload fails', async () => {
    fetch.mockResolvedValueOnce(json({ message: 'Photo upload is unavailable.' }, 503))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [new File(['photo'], 'garden.png', { type: 'image/png' })] } })
    fireEvent.click(submitButton())
    await screen.findByText('Photo upload is unavailable.')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Campaign title').value).toBe(values.title)
    expect(screen.queryByRole('heading', { name: 'Campaign submitted' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /duplicate risk/ })).toBeNull()
    expect(submitButton().disabled).toBe(false)
  })

  it.each(['network', 'server', 'invalid-response'])('requires explicit acknowledgement before retrying an uncertain %s campaign POST', async (failure) => {
    if (failure === 'network') fetch.mockRejectedValueOnce(new TypeError('Network down'))
    else if (failure === 'server') fetch.mockResolvedValueOnce(json({ message: 'The campaign could not be saved.' }, 500))
    else fetch.mockResolvedValueOnce(json({}, 201))
    let resolveRetry
    fetch.mockReturnValueOnce(new Promise(resolve => { resolveRetry = resolve }))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.click(submitButton())
    const acknowledgement = await screen.findByRole('checkbox', { name: /duplicate risk/ })
    expect(submitButton().disabled).toBe(true)
    expect(screen.getByRole('link', { name: /Check My campaigns/ }).getAttribute('target')).toBe('_blank')
    fireEvent.change(screen.getByLabelText('Campaign title'), { target: { value: 'Updated title' } })
    expect(screen.getByText(/campaign may already have been saved/)).toBeTruthy()
    fireEvent.submit(screen.getByRole('form'))
    expect(fetch).toHaveBeenCalledTimes(2)
    fireEvent.click(acknowledgement)
    expect(submitButton().disabled).toBe(false)
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.submit(screen.getByRole('form'))
    expect(fetch).toHaveBeenCalledTimes(3)
    await act(async () => resolveRetry(json({ campaign: { ...saved.campaign, title: 'Updated title' } }, 201)))
    expect(await screen.findByRole('heading', { name: 'Campaign submitted' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /duplicate risk/ })).toBeNull()
  })

  it('retains the uploaded image after an uncertain campaign write and requires a fresh acknowledgement for another uncertain retry', async () => {
    fetch.mockResolvedValueOnce(json({ imageId: 'img_123', contentType: 'image/png', sizeBytes: 5, expiresAt: '2099-01-01T00:00:00.000Z' }, 201))
      .mockRejectedValueOnce(new TypeError('Lost first receipt'))
      .mockResolvedValueOnce(json({ message: 'Unavailable' }, 503))
      .mockResolvedValueOnce(json(saved, 201))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [new File(['photo'], 'garden.png', { type: 'image/png' })] } })
    fireEvent.click(submitButton())
    fireEvent.click(await screen.findByRole('checkbox', { name: /duplicate risk/ }))
    fireEvent.click(submitButton())
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /duplicate risk/ }).checked).toBe(false))
    expect(submitButton().disabled).toBe(true)
    expect(fetch.mock.calls.filter(([url]) => url === '/api/campaign-images')).toHaveLength(1)
    fireEvent.click(screen.getByRole('checkbox', { name: /duplicate risk/ }))
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { name: 'Campaign submitted' })
    expect(fetch.mock.calls.filter(([url]) => url === '/api/campaigns').map(([, options]) => JSON.parse(options.body).imageId)).toEqual(['img_123', 'img_123', 'img_123'])
  })

  it('blocks an unsupported photo and allows the user to replace it', async () => {
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [new File(['vector'], 'garden.svg', { type: 'image/svg+xml' })] } })
    fireEvent.click(submitButton())
    expect(screen.getByText('Choose a JPG, PNG or WebP photo.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText(/Campaign photo/))
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(screen.queryByText('Choose a JPG, PNG or WebP photo.')).toBeNull()
    fetch.mockResolvedValueOnce(json(saved, 201))
    fireEvent.click(submitButton())
    await screen.findByRole('heading', { name: 'Campaign submitted' })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('imageId')
  })

  it.each([
    { imageId: '', contentType: 'image/png', sizeBytes: 5, expiresAt: '2099-01-01T00:00:00.000Z' },
    { imageId: 'img_123', contentType: 'image/png', sizeBytes: 5, expiresAt: '2000-01-01T00:00:00.000Z' },
  ])('does not submit when the image reference is invalid or already expired', async (upload) => {
    fetch.mockResolvedValueOnce(json(upload, 201))
    render(<CreateCampaignPage />)
    await readyForm()
    fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [new File(['photo'], 'garden.png', { type: 'image/png' })] } })
    fireEvent.click(submitButton())
    await screen.findByText('The photo upload was not confirmed. Please try uploading the photo again.')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('heading', { name: 'Campaign submitted' })).toBeNull()
  })
})

describe('Campaign submission validation', () => {
  it('accepts a real leap day and same-day campaigns', () => {
    expect(validateCampaignSubmission({ ...values, startDate: '2028-02-29', endDate: '2028-02-29' }, categories)).toEqual({})
  })

  it.each(['2026-02-29', '2026-04-31', '0999-12-31', '10000-01-01', '2026-1-01'])('rejects invalid date %s', (startDate) => {
    expect(validateCampaignSubmission({ ...values, startDate }, categories)).toHaveProperty('startDate')
  })

  it('checks lengths, category membership, and date order', () => {
    expect(validateCampaignSubmission({ ...values, title: 'a'.repeat(151), description: 'a'.repeat(5001), targetAudience: 'a'.repeat(256), categoryId: '99', endDate: '2026-10-09' }, categories)).toEqual({
      title: 'Use 150 characters or fewer.', description: 'Use 5,000 characters or fewer.',
      targetAudience: 'Use 255 characters or fewer.', categoryId: 'Choose an available category.',
      endDate: 'End date must be on or after the start date.',
    })
  })

  it.each([{}, { categories: [{ id: '7', name: 'Local action' }] }, { categories: [{ id: 7, name: '' }] }, { categories: [categories[0], categories[0]] }])('rejects a malformed category response: %j', async (body) => {
    fetch.mockReset().mockResolvedValueOnce(json(body))
    await expect(loadCampaignCategories()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
