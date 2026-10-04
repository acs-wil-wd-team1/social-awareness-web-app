import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EditCampaignPage from './EditCampaignPage.jsx'

const original = { id: 4, title: 'Community garden', description: 'Join the garden team.', categoryId: 2,
  status: 'approved', startDate: '2026-10-10', endDate: '2026-10-11', targetAudience: 'Local residents',
  imageUrl: '/images/garden.png', updatedAt: '2026-09-30T12:00:00.000Z' }
const updated = { ...original, status: 'pending', updatedAt: '2026-09-30T12:01:00.000Z' }
const categories = [{ id: 2, name: 'Environment' }, { id: 3, name: 'Education' }]
const uploaded = { imageId: 'img_42', contentType: 'image/png', sizeBytes: 5, expiresAt: '2099-01-01T00:00:00.000Z' }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
let handlers
const page = (props = {}) => <EditCampaignPage campaignId="4" token="owner-token" role="public" {...props} />
const form = () => screen.getByRole('form', { name: 'Edit campaign form' })
const writes = () => fetch.mock.calls.filter(([, options]) => ['PATCH', 'DELETE'].includes(options.method))
const ready = () => screen.findByDisplayValue(original.title)
function photo(name = 'garden.png') { return new File(['photo'], name, { type: 'image/png' }) }
function choosePhoto(file = photo()) { fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [file] } }); return file }
function confirmRemoval() {
  fireEvent.click(screen.getByRole('button', { name: 'Remove campaign' }))
  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: original.title } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => {
  localStorage.clear()
  handlers = { load: () => json(original), categories: () => json({ categories }),
    save: () => json({ campaign: updated }), remove: () => new Response(null, { status: 204 }), upload: () => json(uploaded, 201) }
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    if (String(url).includes('/categories')) return Promise.resolve(handlers.categories())
    if (String(url).includes('/campaign-images')) return Promise.resolve(handlers.upload(url, options))
    return Promise.resolve(handlers[options.method === 'PATCH' ? 'save' : options.method === 'DELETE' ? 'remove' : 'load'](url, options))
  }))
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('owner campaign editing', () => {
  it.each(['public', 'business_owner'])('loads the existing record for an allowed %s account', async (role) => {
    render(page({ role }))
    await ready()
    expect(screen.getByLabelText('Category').value).toBe('2')
    expect(screen.getByRole('img', { name: 'Current campaign photo' }).getAttribute('src')).toBe(original.imageUrl)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([{ token: null }, { role: 'admin' }, { role: 'unknown' }])('blocks unavailable author access without requests: %j', (props) => {
    render(page(props))
    expect(screen.queryByRole('form')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    if (!props.token && !props.role) expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toContain('returnTo=%2Fmy-campaigns%2F4%2Fedit')
  })

  it('sends only editable fields plus the original version and confirms pending status', async () => {
    render(page())
    await ready()
    fireEvent.change(screen.getByLabelText('Campaign title'), { target: { value: '  Updated garden  ' } })
    fireEvent.submit(form())
    await screen.findByRole('heading', { name: 'Changes submitted for review' })
    expect(JSON.parse(writes()[0][1].body)).toEqual({ title: 'Updated garden', description: original.description,
      categoryId: 2, targetAudience: original.targetAudience, startDate: original.startDate, endDate: original.endDate,
      expectedUpdatedAt: original.updatedAt })
    expect(screen.getByText(/not publicly visible until approved again/)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('status'))
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('validates input and focuses the invalid field before making a change', async () => {
    render(page())
    await ready()
    fireEvent.change(screen.getByLabelText('Campaign title'), { target: { value: ' ' } })
    fireEvent.submit(form())
    expect(screen.getByText('Title is required.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Campaign title'))
    expect(writes()).toHaveLength(0)
  })

  it.each(['client', 'server'])('keeps focus while correcting multiple %s validation errors', async source => {
    if (source === 'server') handlers.save = () => json({ message: 'Check fields.', fieldErrors: { title: 'Check the title.', description: 'Check the description.' } }, 422)
    render(page()); await ready()
    const title = screen.getByLabelText('Campaign title')
    if (source === 'client') {
      fireEvent.change(title, { target: { value: '' } })
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } })
    }
    fireEvent.submit(form())
    await waitFor(() => expect(document.activeElement).toBe(title))
    fireEvent.change(title, { target: { value: 'B' } })
    expect(document.activeElement).toBe(title)
    fireEvent.change(title, { target: { value: 'Better title' } })
    expect(title.value).toBe('Better title')
  })

  it('does not steal focus when a photo is invalid, but focuses it after a failed save', async () => {
    render(page()); await ready()
    const title = screen.getByLabelText('Campaign title')
    title.focus()
    choosePhoto(new File(['svg'], 'image.svg', { type: 'image/svg+xml' }))
    expect(document.activeElement).toBe(title)
    fireEvent.change(title, { target: { value: 'Updated title' } })
    expect(document.activeElement).toBe(title)
    fireEvent.submit(form())
    expect(document.activeElement).toBe(screen.getByLabelText(/Campaign photo/))
    expect(writes()).toHaveLength(0)
  })

  it('deduplicates saves and disables controls while the write is in flight', async () => {
    const pending = deferred(); handlers.save = () => pending.promise
    render(page()); await ready()
    fireEvent.submit(form()); fireEvent.submit(form())
    expect(writes()).toHaveLength(1)
    expect(screen.getByLabelText('Campaign title').closest('fieldset').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Remove campaign' }).disabled).toBe(true)
    await act(async () => pending.resolve(json({ campaign: updated })))
    expect(screen.getByRole('heading', { name: 'Changes submitted for review' })).toBeTruthy()
  })

  it('preserves values and permits a corrected retry after a validation error', async () => {
    handlers.save = () => json({ message: 'Check the fields.', fieldErrors: { categoryId: 'Choose another category.' } }, 422)
    render(page()); await ready(); fireEvent.submit(form())
    await screen.findByText('Choose another category.')
    expect(screen.getByLabelText('Campaign title').value).toBe(original.title)
    expect(document.activeElement).toBe(screen.getByLabelText('Category'))
    handlers.save = () => json({ campaign: { ...updated, categoryId: 3 } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '3' } })
    fireEvent.submit(form())
    await screen.findByText('Changes submitted for review')
    expect(writes()).toHaveLength(2)
  })

  it.each([
    ['network failure', () => { throw new TypeError('Connection lost') }],
    ['HTTP500', () => json({ message: 'Server unavailable.' }, 500)],
    ['HTTP200 invalid body', () => json({})],
    ['HTTP200 invalid saved status', () => json({ campaign: original })],
    ['HTTP204', () => new Response(null, { status: 204 })],
    ['version conflict', () => json({ message: 'Campaign changed.', code: 'CAMPAIGN_CHANGED' }, 409)],
  ])('blocks another mutation after %s until the saved version is reloaded', async (_, handler) => {
    handlers.save = handler
    render(page()); await ready(); fireEvent.submit(form())
    await screen.findByText(/We cannot safely apply another change yet/)
    expect(screen.getByLabelText('Campaign title').closest('fieldset').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Remove campaign' }).disabled).toBe(true)
    fireEvent.submit(form()); expect(writes()).toHaveLength(1)
    handlers.load = () => json(updated)
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved campaign' }))
    await waitFor(() => expect(screen.getByLabelText('Campaign title').closest('fieldset').disabled).toBe(false))
    handlers.save = () => json({ campaign: { ...updated, updatedAt: '2026-09-30T12:02:00.000Z' } })
    fireEvent.submit(form()); await screen.findByText('Changes submitted for review')
    expect(JSON.parse(writes()[1][1].body).expectedUpdatedAt).toBe(updated.updatedAt)
  })

  it.each([401, 403, 404])('blocks further writes after HTTP%s access is rejected', async (status) => {
    handlers.save = () => json({ message: 'Access rejected.' }, status)
    render(page()); await ready(); fireEvent.submit(form())
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Campaign title').closest('fieldset').disabled).toBe(true)
    fireEvent.submit(form()); expect(writes()).toHaveLength(1)
    if (status === 401) expect(screen.getByRole('link', { name: 'Log in again' }).getAttribute('href')).toBe('/login?returnTo=%2Fmy-campaigns%2F4%2Fedit')
  })

  it('uploads the selected photo first and reuses it after a field-validation error', async () => {
    handlers.save = () => json({ message: 'Check category.', fieldErrors: { categoryId: 'Choose another category.' } }, 422)
    render(page()); await ready(); const file = choosePhoto(); fireEvent.submit(form())
    await screen.findByText('Choose another category.')
    const uploads = () => fetch.mock.calls.filter(([url]) => url === '/api/campaign-images')
    expect(uploads()[0][1].body.get('file')).toBe(file)
    expect(uploads()[0][1].headers).not.toHaveProperty('Content-Type')
    expect(JSON.parse(writes()[0][1].body).imageId).toBe('img_42')
    handlers.save = () => json({ campaign: updated })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '3' } })
    fireEvent.submit(form()); await screen.findByText('Changes submitted for review')
    expect(uploads()).toHaveLength(1)
  })

  it('sends an explicit image removal and never sends both image operations', async () => {
    render(page()); await ready()
    fireEvent.click(screen.getByRole('checkbox', { name: /Remove the current photo/ }))
    fireEvent.submit(form()); await screen.findByText('Changes submitted for review')
    expect(JSON.parse(writes()[0][1].body)).toMatchObject({ removeImage: true })
    expect(JSON.parse(writes()[0][1].body)).not.toHaveProperty('imageId')
  })

  it('replaces a prior removal choice when a new photo is chosen', async () => {
    render(page()); await ready()
    fireEvent.click(screen.getByRole('checkbox', { name: /Remove the current photo/ }))
    choosePhoto(); fireEvent.submit(form()); await screen.findByText('Changes submitted for review')
    expect(JSON.parse(writes()[0][1].body)).toMatchObject({ imageId: 'img_42' })
    expect(JSON.parse(writes()[0][1].body)).not.toHaveProperty('removeImage')
  })

  it('does not patch after an upload failure and allows another upload attempt', async () => {
    handlers.upload = () => json({ message: 'Upload unavailable.' }, 503)
    render(page()); await ready(); choosePhoto(); fireEvent.submit(form())
    await screen.findByText('Upload unavailable.')
    expect(writes()).toHaveLength(0)
    expect(screen.getByLabelText('Campaign title').closest('fieldset').disabled).toBe(false)
    handlers.upload = () => json(uploaded, 201)
    fireEvent.submit(form()); await screen.findByText('Changes submitted for review')
  })

  it('requires the image to be selected again after the server rejects its reference', async () => {
    handlers.save = () => json({ message: 'Image expired.', fieldErrors: { imageId: 'Choose the photo again.' } }, 422)
    render(page()); await ready(); choosePhoto(); fireEvent.submit(form())
    await screen.findByText('Choose the photo again.')
    fireEvent.submit(form()); expect(writes()).toHaveLength(1)
    choosePhoto(photo('replacement.png'))
    handlers.save = () => json({ campaign: updated })
    fireEvent.submit(form()); await screen.findByText('Changes submitted for review')
    expect(fetch.mock.calls.filter(([url]) => url === '/api/campaign-images')).toHaveLength(2)
  })

  it('blocks unsupported image files without an upload or patch', async () => {
    render(page()); await ready(); choosePhoto(new File(['svg'], 'image.svg', { type: 'image/svg+xml' }))
    fireEvent.submit(form())
    expect(screen.getByText('Choose a JPG, PNG or WebP photo.')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never carries an old session’s late upload reference into the replacement session', async () => {
    const old = deferred(); handlers.upload = () => old.promise
    const view = render(page()); await ready(); choosePhoto(); fireEvent.submit(form())
    const oldSignal = fetch.mock.calls.find(([url]) => url === '/api/campaign-images')[1].signal
    view.rerender(page({ token: 'new-owner-token' })); await ready()
    expect(oldSignal.aborted).toBe(true)
    await act(async () => old.resolve(json({ ...uploaded, imageId: 'old-session-image' }, 201)))
    expect(writes()).toHaveLength(0)
    handlers.upload = () => json({ ...uploaded, imageId: 'new-session-image' }, 201)
    choosePhoto(photo('new-owner.png')); fireEvent.submit(form())
    await screen.findByText('Changes submitted for review')
    expect(JSON.parse(writes()[0][1].body).imageId).toBe('new-session-image')
    expect(writes()[0][1].headers.Authorization).toBe('Bearer new-owner-token')
  })

  it('aborts pending writes on unmount without rendering a late success', async () => {
    const pending = deferred(); handlers.save = () => pending.promise
    const view = render(page()); await ready(); fireEvent.submit(form())
    const signal = writes()[0][1].signal
    view.unmount(); expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(json({ campaign: updated })))
    expect(screen.queryByText('Changes submitted for review')).toBeNull()
  })

  it('does not reveal an unavailable or other owner’s campaign', async () => {
    handlers.load = () => json({ message: 'Not found.' }, 404)
    render(page())
    await screen.findByText('This campaign is unavailable or does not belong to your account.')
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove campaign' })).toBeNull()
  })

  it('shows rejection feedback and uses the resubmission label', async () => {
    handlers.load = () => json({ ...original, status: 'rejected', review: { comments: 'Please clarify the dates.' } })
    render(page()); await ready()
    expect(screen.getByText('Please clarify the dates.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resubmit for review' })).toBeTruthy()
  })

  it('clears unsaved edits and aborts the old save when the requested campaign ID changes', async () => {
    const pending = deferred(); handlers.save = () => pending.promise
    const view = render(page()); await ready()
    fireEvent.change(screen.getByLabelText('Campaign title'), { target: { value: 'Unsaved old title' } })
    fireEvent.submit(form())
    const oldSignal = writes()[0][1].signal
    handlers.load = () => json({ ...original, id: 5, title: 'Different campaign' })
    view.rerender(page({ campaignId: '5' }))
    await screen.findByDisplayValue('Different campaign')
    expect(oldSignal.aborted).toBe(true)
    await act(async () => pending.resolve(json({ campaign: updated })))
    expect(screen.queryByText('Changes submitted for review')).toBeNull()
    expect(screen.getByLabelText('Campaign title').value).toBe('Different campaign')
  })

  it('uploads again if a previously accepted photo reference expires before retrying', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T12:00:00.000Z'))
    handlers.upload = () => json({ ...uploaded, expiresAt: '2026-09-30T12:01:00.000Z' }, 201)
    handlers.save = () => json({ message: 'Check category.', fieldErrors: { categoryId: 'Choose another category.' } }, 422)
    render(page()); await ready(); choosePhoto(); fireEvent.submit(form())
    await screen.findByText('Choose another category.')
    now.mockReturnValue(Date.parse('2026-09-30T12:02:00.000Z'))
    handlers.upload = () => json({ ...uploaded, imageId: 'fresh-image', expiresAt: '2026-09-30T12:03:00.000Z' }, 201)
    handlers.save = () => json({ campaign: updated })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '3' } })
    fireEvent.submit(form()); await screen.findByText('Changes submitted for review')
    expect(fetch.mock.calls.filter(([url]) => url === '/api/campaign-images')).toHaveLength(2)
    expect(JSON.parse(writes()[1][1].body).imageId).toBe('fresh-image')
  })
})

describe('owner campaign removal', () => {
  it('requires the exact title, allows cancellation and only sends DELETE after confirmation', async () => {
    render(page()); await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Remove campaign' }))
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'Wrong title' } })
    expect(screen.getByRole('button', { name: 'Confirm removal' }).disabled).toBe(true)
    fireEvent.submit(form()); expect(writes()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm campaign removal' })).toBeNull()
    confirmRemoval(); await screen.findByText('Campaign removed')
    expect(writes()).toHaveLength(1)
    expect(writes()[0][1].method).toBe('DELETE')
    expect(JSON.parse(writes()[0][1].body)).toEqual({ expectedUpdatedAt: original.updatedAt })
    expect(screen.getByText(/records are retained by the service/)).toBeTruthy()
  })

  it('deduplicates confirmed removals while pending', async () => {
    const pending = deferred(); handlers.remove = () => pending.promise
    render(page()); await ready(); confirmRemoval()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(writes()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    await act(async () => pending.resolve(new Response(null, { status: 204 })))
    expect(screen.getByText('Campaign removed')).toBeTruthy()
  })

  it.each([
    ['HTTP200', () => json({ deleted: true })],
    ['network failure', () => { throw new TypeError('Connection lost') }],
    ['conflict', () => json({ message: 'Campaign changed.' }, 409)],
  ])('does not repeat or falsely confirm removal after %s', async (_, handler) => {
    handlers.remove = handler
    render(page()); await ready(); confirmRemoval()
    await screen.findByText(/We cannot safely apply another change yet/)
    expect(screen.getByRole('button', { name: 'Confirm removal' }).disabled).toBe(true)
    expect(screen.queryByText('Campaign removed')).toBeNull()
    expect(writes()).toHaveLength(1)
  })
})
