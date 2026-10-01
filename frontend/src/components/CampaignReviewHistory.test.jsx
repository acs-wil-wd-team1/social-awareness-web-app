import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CampaignReviewHistory from './CampaignReviewHistory.jsx'

const review = { id: 1, campaignId: 12, adminId: 2, action: 'approved', comments: 'Ready to share.', reviewedAt: '2026-10-01T06:00:00Z' }
afterEach(cleanup)

describe('campaign review history', () => {
  it('never requests review records for guests or non-admins', () => {
    const loader = vi.fn()
    render(<CampaignReviewHistory campaignId={12} token="u" role="public" historyLoader={loader} />)
    expect(loader).not.toHaveBeenCalled()
    expect(screen.queryByText('Review history')).toBeNull()
  })
  it('shows decisions, administrator references and comments with pagination', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ reviews: [review], page: 1, pageSize: 1, total: 2 })
      .mockResolvedValue({ reviews: [{ ...review, id: 2, action: 'rejected', comments: 'Add a location.' }], page: 2, pageSize: 1, total: 2 })
    render(<CampaignReviewHistory campaignId={12} token="a" role="admin" historyLoader={loader} />)
    await screen.findByText('Ready to share.')
    expect(screen.getByText('Administrator #2 · Review #1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next reviews' }))
    await screen.findByText('Add a location.')
    expect(loader).toHaveBeenLastCalledWith(12, expect.objectContaining({ page: 2 }))
  })
  it('retries failed history without displaying an empty successful result', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ reviews: [], page: 1, pageSize: 10, total: 0 })
    render(<CampaignReviewHistory campaignId={12} token="a" role="admin" historyLoader={loader} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry review history' }))
    await screen.findByText('No review decisions on this page.')
  })
  it('ignores a stale response after moving to a different campaign', async () => {
    let finish
    const loader = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValue({ reviews: [], page: 1, pageSize: 10, total: 0 })
    const view = render(<CampaignReviewHistory campaignId={12} token="a" role="admin" historyLoader={loader} />)
    view.rerender(<CampaignReviewHistory campaignId={13} token="a" role="admin" historyLoader={loader} />)
    await screen.findByText('No review decisions on this page.')
    finish({ reviews: [review], page: 1, pageSize: 10, total: 1 })
    await waitFor(() => expect(screen.queryByText('Ready to share.')).toBeNull())
  })
})
