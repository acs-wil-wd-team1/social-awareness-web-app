import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import { maxImageBytes, validateDraftCampaign, validateDraftImage } from '../drafts/campaignSubmissionDraft.js'
import CreateCampaignPage from './CreateCampaignDraftPage.jsx'
import { storeSession } from '../services/authSession.js'

const validValues = {
  title: 'Community Garden Day',
  description: 'Help prepare a shared neighbourhood garden.',
  categoryId: '3',
  targetAudience: '',
  startDate: '2026-10-10',
  endDate: '2026-10-11',
}
const sampleResult = { sampleOnly: true, campaign: { title: validValues.title, status: 'pending' } }

function fillForm() {
  for (const [label, value] of Object.entries({
    'Campaign title': validValues.title,
    Description: validValues.description,
    Category: validValues.categoryId,
    'Start date': validValues.startDate,
    'End date': validValues.endDate,
  })) fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function choosePhoto(file) {
  fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [file] } })
}

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('The draft must not call fetch') }))
  const NativeURL = URL
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn().mockReturnValueOnce('blob:first-photo').mockReturnValue('blob:next-photo')
    static revokeObjectURL = vi.fn()
  })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Local campaign frontend draft', () => {
  it('opens only at the development draft route with an explicit sample notice', async () => {
    render(<App pathname="/draft/campaigns/new" />)
    expect(await screen.findByText('Frontend draft — uses sample data; nothing is sent or saved')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Create campaign' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not expose the draft route in production', () => {
    vi.stubEnv('DEV', false)
    render(<App pathname="/draft/campaigns/new" />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.queryByLabelText('Sample account')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the sample out of navigation while linking to real campaign creation', () => {
    storeSession('existing-token', { id: 3, name: 'Test user', role: 'public' })
    render(<App pathname="/login" />)
    expect(screen.getByRole('link', { name: 'Logout' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create campaign' }).getAttribute('href')).toBe('/campaigns/new')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lets reviewers inspect guest and missing-business-profile states without changing login', () => {
    localStorage.setItem('token', 'existing-token')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    render(<CreateCampaignPage />)
    fireEvent.change(screen.getByLabelText('Sample account'), { target: { value: 'guest' } })
    expect(screen.getByRole('heading', { name: 'Guest preview' })).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
    fireEvent.change(screen.getByLabelText('Sample account'), { target: { value: 'business-missing' } })
    expect(screen.getByRole('heading', { name: 'Business profile needed' })).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
    fireEvent.change(screen.getByLabelText('Sample account'), { target: { value: 'business' } })
    expect(screen.getByText(/Small-business campaign for Green Leaf Cafe/)).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Sample campaign form' })).toBeTruthy()
    expect(localStorage.getItem('token')).toBe('existing-token')
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows required-field errors and focuses the first invalid field', () => {
    const submitSample = vi.fn()
    render(<CreateCampaignPage submitSample={submitSample} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    for (const message of ['Title is required.', 'Description is required.', 'Choose a category.', 'Start date is required.', 'End date is required.']) {
      expect(screen.getByText(message, { selector: 'p' })).toBeTruthy()
    }
    expect(document.activeElement).toBe(screen.getByLabelText('Campaign title'))
    expect(submitSample).not.toHaveBeenCalled()
  })

  it('rejects reversed dates while preserving the entered values', () => {
    render(<CreateCampaignPage />)
    fillForm()
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-09' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(screen.getByText('End date must be on or after the start date.')).toBeTruthy()
    expect(screen.getByLabelText('Campaign title').value).toBe(validValues.title)
    expect(document.activeElement).toBe(screen.getByLabelText('End date'))
  })

  it('validates impossible dates, unknown categories and field limits', () => {
    expect(validateDraftCampaign({ ...validValues, startDate: '2026-02-30' }).startDate).toBe('Enter a valid start date.')
    expect(validateDraftCampaign({ ...validValues, categoryId: '999' }).categoryId).toBeTruthy()
    expect(validateDraftCampaign({ ...validValues, title: 'x'.repeat(151), description: 'x'.repeat(5001), targetAudience: 'x'.repeat(256) })).toMatchObject({
      title: expect.any(String), description: expect.any(String), targetAudience: expect.any(String),
    })
    expect(validateDraftCampaign({ ...validValues, endDate: validValues.startDate })).toEqual({})
  })

  it.each(['image/jpeg', 'image/png', 'image/webp'])('allows a local %s preview', (type) => {
    render(<CreateCampaignPage />)
    choosePhoto(new File(['sample'], 'photo', { type }))
    expect(screen.getByRole('img', { name: 'Selected campaign photo preview' }).getAttribute('src')).toBe('blob:first-photo')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects unsupported, empty and oversized images with a precise 5 MB boundary', () => {
    expect(maxImageBytes).toBe(5_000_000)
    expect(validateDraftImage({ type: 'image/png', size: 5_000_000 })).toBe('')
    expect(validateDraftImage({ type: 'image/png', size: 5_000_001 })).toMatch(/no larger than 5 MB/)
    expect(validateDraftImage(new File([], 'empty.png', { type: 'image/png' }))).toMatch(/not empty/)
    const submitSample = vi.fn()
    render(<CreateCampaignPage submitSample={submitSample} />)
    fillForm()
    choosePhoto(new File(['gif'], 'photo.gif', { type: 'image/gif' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(screen.getByText('Choose a JPEG, PNG or WebP image.')).toBeTruthy()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(submitSample).not.toHaveBeenCalled()
  })

  it('releases object URLs on replacement, removal and unmount', () => {
    const { unmount } = render(<CreateCampaignPage />)
    choosePhoto(new File(['one'], 'one.png', { type: 'image/png' }))
    choosePhoto(new File(['two'], 'two.png', { type: 'image/png' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-photo')
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:next-photo')
    expect(screen.queryByRole('img')).toBeNull()
    choosePhoto(new File(['three'], 'three.png', { type: 'image/png' }))
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
  })

  it('does not submit an image that the browser cannot preview', () => {
    const submitSample = vi.fn()
    render(<CreateCampaignPage submitSample={submitSample} />)
    fillForm()
    choosePhoto(new File(['bad'], 'broken.png', { type: 'image/png' }))
    fireEvent.error(screen.getByRole('img'))
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(screen.getByText('This image could not be previewed. Choose another file.')).toBeTruthy()
    expect(submitSample).not.toHaveBeenCalled()
  })

  it('previews a pending result without requests, saved data or an invented image ID', async () => {
    const submitSample = vi.fn().mockResolvedValue(sampleResult)
    localStorage.setItem('token', 'existing-token')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    render(<CreateCampaignPage submitSample={submitSample} />)
    fillForm()
    choosePhoto(new File(['sample'], 'photo.png', { type: 'image/png' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(await screen.findByRole('heading', { name: 'Sample result: pending review' })).toBeTruthy()
    expect(submitSample).toHaveBeenCalledWith({ title: validValues.title, description: validValues.description, categoryId: 3, startDate: validValues.startDate, endDate: validValues.endDate }, { sampleAccount: 'public', simulateError: false })
    expect(screen.getByRole('status').textContent).toContain('No campaign was created')
    expect(fetch).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe('existing-token')
  })

  it('supports a sample error and a successful retry without making a request', async () => {
    render(<CreateCampaignPage />)
    fillForm()
    fireEvent.click(screen.getByLabelText('Try a sample submission error'))
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByLabelText('Campaign title').value).toBe(validValues.title)
    fireEvent.click(screen.getByLabelText('Try a sample submission error'))
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(await screen.findByRole('heading', { name: 'Sample result: pending review' })).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows sample field errors and allows correction', async () => {
    const submitSample = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Check the sample title.'), { fieldErrors: { title: 'Sample title needs checking.' } })).mockResolvedValue(sampleResult)
    render(<CreateCampaignPage submitSample={submitSample} />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(await screen.findByText('Sample title needs checking.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Campaign title')))
    fireEvent.change(screen.getByLabelText('Campaign title'), { target: { value: 'Garden Day revised' } })
    expect(screen.queryByText('Sample title needs checking.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Preview submission' }))
    expect(await screen.findByRole('heading', { name: 'Sample result: pending review' })).toBeTruthy()
  })

  it('ignores a second submission while the first sample is pending', async () => {
    let resolveSubmission
    const submitSample = vi.fn(() => new Promise((resolve) => { resolveSubmission = resolve }))
    render(<CreateCampaignPage submitSample={submitSample} />)
    fillForm()
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.submit(screen.getByRole('form'))
    expect(submitSample).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('group').disabled).toBe(true)
    await act(async () => resolveSubmission(sampleResult))
    expect(screen.getByRole('heading', { name: 'Sample result: pending review' })).toBeTruthy()
  })
})
