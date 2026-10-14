import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MyCampaignsPage from './MyCampaignsPage.jsx'

const pending = { id: 12, title: 'Neighbourhood gardens', description: 'Plant a shared garden.', category: 'Environment', status: 'pending' }
function toggleDetails(details, open = true) { details.open = open; fireEvent(details, new Event('toggle')) }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('owner campaign status', () => {
  it('does not mount private photos in closed details or replace a working ticket on each refresh', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=old' }], page: 1, pageSize: 10 })
      .mockResolvedValue({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=new' }], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    const summary = await screen.findByText(/View submitted details/)
    expect(screen.queryByAltText('Your submitted campaign image')).toBeNull()
    const details = summary.closest('details')
    toggleDetails(details)
    const photo = await screen.findByAltText('Your submitted campaign image')
    expect(photo.getAttribute('loading')).toBe('lazy')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })))
    expect(screen.getByAltText('Your submitted campaign image')).toBe(photo)
    expect(photo.getAttribute('src')).toBe('/private-photo?signature=old')
    toggleDetails(details, false)
    expect(screen.queryByAltText('Your submitted campaign image')).toBeNull()
  })

  it('shows a refreshed signed image after the previous URL failed without closing details', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=old' }], page: 1, pageSize: 10 })
      .mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=new' }], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    const details = (await screen.findByText(/View submitted details/)).closest('details')
    toggleDetails(details)
    const oldImage = await screen.findByAltText('Your submitted campaign image')
    fireEvent.error(oldImage)
    expect(oldImage.hidden).toBe(true)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })))
    const refreshedImage = screen.getByAltText('Your submitted campaign image')
    expect(refreshedImage.getAttribute('src')).toBe('/private-photo?signature=new')
    expect(refreshedImage.hidden).toBe(false)
    expect(details.open).toBe(true)
  })

  it('uses the latest ticket after an open photo fails, without another campaign request', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=old' }], page: 1, pageSize: 10 })
      .mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=new' }], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    const details = (await screen.findByText(/View submitted details/)).closest('details')
    toggleDetails(details)
    const oldPhoto = await screen.findByAltText('Your submitted campaign image')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })))
    expect(oldPhoto.getAttribute('src')).toBe('/private-photo?signature=old')
    fireEvent.error(oldPhoto)
    const refreshed = screen.getByAltText('Your submitted campaign image')
    expect(refreshed).not.toBe(oldPhoto)
    expect(refreshed.getAttribute('src')).toBe('/private-photo?signature=new')
    expect(refreshed.hidden).toBe(false)
    expect(details.open).toBe(true)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('replaces a changed photo on the same campaign while preserving open details', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/api/campaign-images/old/content?ticket=one' }], page: 1, pageSize: 10 })
      .mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/api/campaign-images/replacement/content?ticket=two' }], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    const details = (await screen.findByText(/View submitted details/)).closest('details')
    toggleDetails(details)
    const oldPhoto = await screen.findByAltText('Your submitted campaign image')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })))
    const replacement = screen.getByAltText('Your submitted campaign image')
    expect(replacement).not.toBe(oldPhoto)
    expect(replacement.getAttribute('src')).toBe('/api/campaign-images/replacement/content?ticket=two')
    expect(details.open).toBe(true)
  })

  it('clears private photo state when the session changes, even for the same campaign ID', async () => {
    let finishNewSession
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=old-owner' }], page: 1, pageSize: 10 })
      .mockImplementationOnce(() => new Promise(resolve => { finishNewSession = resolve }))
    const view = render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    const details = (await screen.findByText(/View submitted details/)).closest('details')
    toggleDetails(details)
    await screen.findByAltText('Your submitted campaign image')
    view.rerender(<MyCampaignsPage token="new-owner" role="public" campaignLoader={loader} />)
    expect(screen.queryByAltText('Your submitted campaign image')).toBeNull()
    expect(screen.queryByText(pending.title)).toBeNull()
    await act(async () => finishNewSession({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=new-owner' }], page: 1, pageSize: 10 }))
    const newDetails = screen.getByText(/View submitted details/).closest('details')
    expect(newDetails.open).toBe(false)
    expect(screen.queryByAltText('Your submitted campaign image')).toBeNull()
    toggleDetails(newDetails)
    expect(screen.getByAltText('Your submitted campaign image').getAttribute('src')).toBe('/private-photo?signature=new-owner')
  })

  it('asks guests to sign in without requesting owner data', () => {
    const loader = vi.fn()
    render(<MyCampaignsPage campaignLoader={loader} />)
    expect(screen.getByRole('heading', { name: 'Log in to see your campaigns' })).toBeTruthy()
    expect(loader).not.toHaveBeenCalled()
  })

  it('shows pending details privately, rejection feedback and an approved-only public link', async () => {
    const loader = vi.fn().mockResolvedValue({ campaigns: [
      pending,
      { ...pending, id: 13, title: 'Book collection', status: 'rejected', review: { comments: 'Add a collection address.' } },
      { ...pending, id: 14, title: 'School garden', status: 'approved' },
    ], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    expect(await screen.findByText('Waiting for review. This campaign is not visible publicly.')).toBeTruthy()
    expect(screen.getByText('Add a collection address.')).toBeTruthy()
    const publicLinks = screen.getAllByRole('link', { name: /View public campaign/ })
    expect(publicLinks).toHaveLength(1)
    expect(publicLinks[0].getAttribute('href')).toBe('/campaigns/14')
    expect(screen.getAllByText('Plant a shared garden.')).toHaveLength(3)
  })

  it('supports business owners and links to the business submission form', async () => {
    const loader = vi.fn().mockResolvedValue({ campaigns: [], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="business_owner" campaignLoader={loader} />)
    await screen.findByText('No campaigns found.')
    expect(screen.getByRole('link', { name: 'Post a campaign' }).getAttribute('href')).toBe('/business/campaigns/new')
  })

  it('allows a fresh status check and filtering', async () => {
    const loader = vi.fn().mockResolvedValue({ campaigns: [pending], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    await screen.findByText(pending.title)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByLabelText('Campaign status'), { target: { value: 'rejected' } })
    await waitFor(() => expect(loader).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'rejected', page: 1 })))
  })

  it('shows a session-expired action rather than empty submissions on a 401', async () => {
    const loader = vi.fn().mockRejectedValue({ status: 401 })
    render(<MyCampaignsPage token="expired" role="public" campaignLoader={loader} />)
    expect(await screen.findByRole('link', { name: 'Log in again' })).toBeTruthy()
    expect(screen.queryByText('No campaigns found.')).toBeNull()
  })

  it('refreshes status automatically while preserving open submitted details', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=old' }], page: 1, pageSize: 10 })
      .mockResolvedValueOnce({ campaigns: [{ ...pending, status: 'approved', imageUrl: '/private-photo?signature=new' }], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    await act(async () => {})
    const details = screen.getByText(/View submitted details/).closest('details')
    toggleDetails(details)
    const photo = screen.getByAltText('Your submitted campaign image')
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByText('Your campaign is approved and visible publicly.')).toBeTruthy()
    expect(details.open).toBe(true)
    expect(screen.getByAltText('Your submitted campaign image')).toBe(photo)
    expect(photo.getAttribute('src')).toBe('/private-photo?signature=old')
    expect(screen.getByRole('link', { name: /Manage campaign/ }).getAttribute('href')).toBe('/my-campaigns/12/edit')
  })

  it('keeps prior campaigns during a network error but clears them on revoked access', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [pending], page: 1, pageSize: 10 })
      .mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce({ status: 403 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    await screen.findByText(pending.title)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })))
    expect(screen.getByText(pending.title)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Showing your last loaded campaigns')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })))
    expect(screen.queryByText(pending.title)).toBeNull()
  })
})
