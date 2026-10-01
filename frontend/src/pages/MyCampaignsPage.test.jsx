import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MyCampaignsPage from './MyCampaignsPage.jsx'

const pending = { id: 12, title: 'Neighbourhood gardens', description: 'Plant a shared garden.', category: 'Environment', status: 'pending' }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('owner campaign status', () => {
  it('shows a refreshed signed image after the previous URL failed without closing details', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=old' }], page: 1, pageSize: 10 })
      .mockResolvedValueOnce({ campaigns: [{ ...pending, imageUrl: '/private-photo?signature=new' }], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    const oldImage = await screen.findByAltText('Your submitted campaign image')
    const details = oldImage.closest('details')
    details.open = true
    fireEvent.error(oldImage)
    expect(oldImage.hidden).toBe(true)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh status' })))
    const refreshedImage = screen.getByAltText('Your submitted campaign image')
    expect(refreshedImage.getAttribute('src')).toBe('/private-photo?signature=new')
    expect(refreshedImage.hidden).toBe(false)
    expect(details.open).toBe(true)
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
    const loader = vi.fn().mockResolvedValueOnce({ campaigns: [pending], page: 1, pageSize: 10 })
      .mockResolvedValueOnce({ campaigns: [{ ...pending, status: 'approved' }], page: 1, pageSize: 10 })
    render(<MyCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    await act(async () => {})
    const details = screen.getByText(/View submitted details/).closest('details')
    details.open = true
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByText('Your campaign is approved and visible publicly.')).toBeTruthy()
    expect(details.open).toBe(true)
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
