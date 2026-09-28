import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
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
  it('opens the real creation route in production before the campaign ID route', async () => {
    vi.stubEnv('DEV', false)
    render(<App pathname="/campaigns/new" />)
    await readyForm()
    expect(screen.getByRole('heading', { name: 'Create a campaign' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create campaign' }).getAttribute('aria-current')).toBe('page')
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/categories', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(screen.queryByLabelText('Sample account')).toBeNull()
    expect(screen.queryByLabelText(/Campaign photo/)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('asks guests to log in without loading categories or showing a form', () => {
    localStorage.removeItem('token')
    render(<App pathname="/campaigns/new/" />)
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
    [500, 'The campaign could not be saved. Please try again.'],
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
