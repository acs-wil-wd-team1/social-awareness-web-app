import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminCampaignsPage from './AdminCampaignsPage.jsx'

const campaign = { id: 12, title: 'Neighbourhood gardens', description: 'Plant a shared garden.', category: 'Environment', status: 'pending' }
afterEach(cleanup)

describe('admin campaign queue', () => {
  it('blocks non-admin accounts before requesting private submissions', () => {
    const loader = vi.fn()
    render(<AdminCampaignsPage token="owner" role="public" campaignLoader={loader} />)
    expect(screen.getByRole('heading', { name: 'Admin access required' })).toBeTruthy()
    expect(loader).not.toHaveBeenCalled()
  })

  it('shows pending campaigns by default and links to the protected review page', async () => {
    const loader = vi.fn().mockResolvedValue({ campaigns: [campaign], page: 1, pageSize: 10 })
    render(<AdminCampaignsPage token="admin" role="admin" campaignLoader={loader} />)
    expect(await screen.findByRole('link', { name: 'Review submission: Neighbourhood gardens' })).toBeTruthy()
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', page: 1, token: 'admin' }))
    expect(screen.getByRole('link', { name: campaign.title }).getAttribute('href')).toBe('/admin/campaigns/12')
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true)
  })

  it('resets pagination when a filter changes and handles an empty page after the last full page', async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ campaigns: [campaign], page: 1, pageSize: 1 })
      .mockResolvedValueOnce({ campaigns: [], page: 2, pageSize: 1 })
      .mockResolvedValue({ campaigns: [], page: 1, pageSize: 10 })
    render(<AdminCampaignsPage token="admin" role="admin" campaignLoader={loader} />)
    await screen.findByText(campaign.title)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('No campaigns found.')
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Campaign status'), { target: { value: 'approved' } })
    await waitFor(() => expect(loader).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'approved', page: 1 })))
  })

  it('retries failed requests without treating them as an empty queue', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ campaigns: [], page: 1, pageSize: 10 })
    render(<AdminCampaignsPage token="admin" role="admin" campaignLoader={loader} />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('No campaigns found.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No campaigns found.')).toBeTruthy()
  })

  it('ignores a stale response after filters change', async () => {
    let finishOld
    const loader = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValue({ campaigns: [{ ...campaign, title: 'Approved garden', status: 'approved' }], page: 1, pageSize: 10 })
    render(<AdminCampaignsPage token="admin" role="admin" campaignLoader={loader} />)
    fireEvent.change(screen.getByLabelText('Campaign status'), { target: { value: 'approved' } })
    await screen.findByText('Approved garden')
    finishOld({ campaigns: [campaign], page: 1, pageSize: 10 })
    await waitFor(() => expect(screen.queryByText(campaign.title)).toBeNull())
  })
})
