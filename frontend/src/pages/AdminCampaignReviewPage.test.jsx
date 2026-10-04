import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminCampaignReviewPage from './AdminCampaignReviewPage.jsx'

const version = '2026-10-01T05:00:00.000Z'
const nextVersion = '2026-10-01T06:00:00.000Z'
const pending = { id: 12, title: 'Neighbourhood gardens', description: 'Plant a shared garden.', category: 'Environment', status: 'pending', updatedAt: version }
const emptyHistory = () => Promise.resolve({ reviews: [], page: 1, pageSize: 10, total: 0 })
function setup({ campaign = pending, loader, sender = vi.fn(), unpublishSender = vi.fn(), deleteSender = vi.fn() } = {}) {
  const campaignLoader = loader || vi.fn().mockResolvedValue(campaign)
  render(<AdminCampaignReviewPage token="admin" role="admin" campaignId="12" campaignLoader={campaignLoader} decisionSender={sender} historyLoader={emptyHistory} unpublishSender={unpublishSender} deleteSender={deleteSender} />)
  return { loader: campaignLoader, sender }
}
async function prepareApproval() {
  await screen.findByText(pending.title)
  fireEvent.click(screen.getByRole('radio', { name: 'Approve campaign' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review decision' }))
}
afterEach(cleanup)

describe('admin campaign decisions', () => {
  it('shows the version diagnostic instead of masking an invalid API response', async () => {
    const message = 'The campaign version could not be read. Reload before making a decision.'
    setup({ loader: vi.fn().mockRejectedValue(Object.assign(new Error(message), { code: 'INVALID_RESPONSE' })) })
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Review decision' })).toBeNull()
  })
  it('does not fetch private details for a non-admin user', () => {
    const loader = vi.fn()
    render(<AdminCampaignReviewPage token="owner" role="public" campaignId="12" campaignLoader={loader} />)
    expect(screen.getByRole('heading', { name: 'Admin access required' })).toBeTruthy()
    expect(loader).not.toHaveBeenCalled()
  })

  it('requires an explicit confirmation before sending approval', async () => {
    const sender = vi.fn().mockResolvedValue({ campaign: { id: 12, status: 'approved', updatedAt: nextVersion }, review: { reviewedAt: '2026-10-01' } })
    setup({ sender })
    await prepareApproval()
    expect(sender).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    expect(await screen.findByText('Campaign approved. It is now available publicly.')).toBeTruthy()
    expect(sender).toHaveBeenCalledWith(12, { status: 'approved', comments: '', expectedUpdatedAt: version }, expect.objectContaining({ token: 'admin' }))
    expect(screen.queryByRole('button', { name: 'Review decision' })).toBeNull()
  })

  it('requires a rejection reason, allows cancellation, and saves the reason on confirmation', async () => {
    const sender = vi.fn().mockResolvedValue({ campaign: { id: 12, status: 'rejected', updatedAt: nextVersion }, review: { comments: 'Add the location.' } })
    setup({ sender })
    await screen.findByText(pending.title)
    fireEvent.click(screen.getByRole('radio', { name: 'Reject campaign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review decision' }))
    expect(screen.getByRole('alert').textContent).toContain('explain why')
    expect(sender).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason for rejection (required)'), { target: { value: ' Add the location. ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review decision' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(sender).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Review decision' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    await screen.findByText('Campaign rejected. Your feedback has been saved for the campaign author.')
    expect(sender).toHaveBeenCalledWith(12, { status: 'rejected', comments: 'Add the location.', expectedUpdatedAt: version }, expect.any(Object))
  })

  it('prevents duplicate decisions while saving', async () => {
    let finish
    const sender = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    setup({ sender })
    await prepareApproval()
    const confirm = screen.getByRole('button', { name: 'Confirm approval' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(sender).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Saving review…' }).disabled).toBe(true)
    finish({ campaign: { id: 12, status: 'approved', updatedAt: nextVersion }, review: {} })
    await screen.findByText('Campaign approved. It is now available publicly.')
  })

  it('reloads a conflict and removes decision controls once another admin has reviewed', async () => {
    const loader = vi.fn().mockResolvedValueOnce(pending).mockResolvedValue({ ...pending, status: 'rejected', review: { comments: 'Already reviewed by another admin.' } })
    const sender = vi.fn().mockRejectedValue({ status: 409 })
    setup({ loader, sender })
    await prepareApproval()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    expect(await screen.findByText('This campaign has already been rejected. No further decision is available here.')).toBeTruthy()
    expect(loader).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: 'Review decision' })).toBeNull()
    expect(screen.queryByText('Campaign approved. It is now available publicly.')).toBeNull()
  })

  it('requires a reload after an ambiguous network failure without reporting success', async () => {
    const sender = vi.fn().mockRejectedValue(new Error('Connection lost'))
    setup({ sender })
    await prepareApproval()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    expect(await screen.findByRole('button', { name: 'Reload campaign status' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Approve campaign' }).closest('fieldset').disabled).toBe(true)
    expect(screen.queryByText('Campaign approved. It is now available publicly.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirm approval' })).toBeNull()
  })

  it('does not offer decisions for campaigns that were already approved', async () => {
    setup({ campaign: { ...pending, status: 'approved' } })
    await screen.findByText(pending.title)
    expect(screen.queryByRole('radio', { name: 'Approve campaign' })).toBeNull()
    expect(screen.getByRole('link', { name: 'View public campaign' }).getAttribute('href')).toBe('/campaigns/12')
  })

  it('handles a missing campaign without showing review controls', async () => {
    setup({ loader: vi.fn().mockRejectedValue({ status: 404 }) })
    expect(await screen.findByRole('heading', { name: 'Campaign unavailable' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Approve campaign' })).toBeNull()
  })

  it('ignores a stale details response after navigating to a different campaign', async () => {
    let finishOld
    const loader = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValue({ ...pending, id: 13, title: 'Next campaign' })
    const view = render(<AdminCampaignReviewPage token="admin" role="admin" campaignId="12" campaignLoader={loader} historyLoader={emptyHistory} />)
    view.rerender(<AdminCampaignReviewPage token="admin" role="admin" campaignId="13" campaignLoader={loader} historyLoader={emptyHistory} />)
    await screen.findByText('Next campaign')
    finishOld(pending)
    await waitFor(() => expect(screen.queryByText(pending.title)).toBeNull())
  })

  it('requires a reason and explicit confirmation before returning an approved campaign to pending', async () => {
    const unpublishSender = vi.fn().mockResolvedValue({ id: 12, status: 'pending', updatedAt: nextVersion })
    setup({ campaign: { ...pending, status: 'approved' }, unpublishSender })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from public view' }))
    expect(screen.getByRole('dialog', { name: 'Remove this campaign from public view?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(unpublishSender).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: ' Check the location. ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText(/Campaign removed from public view/)
    expect(unpublishSender).toHaveBeenCalledWith(12, 'Check the location.', expect.objectContaining({ token: 'admin', expectedUpdatedAt: version }))
    expect(screen.getByRole('radio', { name: 'Approve campaign' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove from public view' })).toBeNull()
  })

  it('soft deletes a pending campaign only after confirmation and removes its controls', async () => {
    const deleteSender = vi.fn().mockResolvedValue(undefined)
    setup({ deleteSender })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete campaign' }))
    expect(screen.getByRole('dialog', { name: 'Delete this campaign?' })).toBeTruthy()
    expect(deleteSender).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Duplicate submission.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await screen.findByText(/Campaign deleted from the application/)
    expect(deleteSender).toHaveBeenCalledWith(12, 'Duplicate submission.', expect.objectContaining({ expectedUpdatedAt: version }))
    expect(screen.queryByRole('button', { name: 'Delete campaign' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Approve campaign' })).toBeNull()
  })

  it('reloads a publication conflict instead of claiming a successful removal', async () => {
    const loader = vi.fn().mockResolvedValueOnce({ ...pending, status: 'approved' }).mockResolvedValue(pending)
    setup({ loader, unpublishSender: vi.fn().mockRejectedValue({ status: 409 }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from public view' }))
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Check content.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await screen.findByRole('radio', { name: 'Approve campaign' })
    expect(loader).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Campaign removed from public view/)).toBeNull()
  })

  it('locks content changes after an ambiguous delete failure until status is reloaded', async () => {
    setup({ campaign: { ...pending, status: 'rejected' }, deleteSender: vi.fn().mockRejectedValue(new Error('offline')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete campaign' }))
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Duplicate submission.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await screen.findByRole('button', { name: 'Reload campaign status' })
    expect(screen.getByRole('button', { name: 'Delete campaign' }).disabled).toBe(true)
    expect(screen.queryByText(/Campaign deleted from the application/)).toBeNull()
  })

  it('reloads owner-edited pending content after a stale approval and requires a fresh decision', async () => {
    const loader = vi.fn().mockResolvedValueOnce(pending).mockResolvedValue({ ...pending, description: 'Owner changed these event details.', updatedAt: nextVersion })
    const sender = vi.fn().mockRejectedValueOnce({ status: 409, code: 'CAMPAIGN_CHANGED' })
    setup({ loader, sender })
    await prepareApproval()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    await screen.findByText('Owner changed these event details.')
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0][1].expectedUpdatedAt).toBe(version)
    expect(screen.queryByRole('button', { name: 'Confirm approval' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Approve campaign' }).checked).toBe(false)
    expect(screen.queryByText('Campaign approved. It is now available publicly.')).toBeNull()
    await prepareApproval()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    expect(sender.mock.calls[1][1].expectedUpdatedAt).toBe(nextVersion)
  })

  it('uses each confirmed new version for follow-up unpublish and deletion actions', async () => {
    const thirdVersion = '2026-10-01T07:00:00.000Z'
    const sender = vi.fn().mockResolvedValue({ campaign: { id: 12, status: 'approved', updatedAt: nextVersion }, review: {} })
    const unpublishSender = vi.fn().mockResolvedValue({ id: 12, status: 'pending', updatedAt: thirdVersion })
    const deleteSender = vi.fn().mockResolvedValue(undefined)
    setup({ sender, unpublishSender, deleteSender })
    await prepareApproval()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from public view' }))
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Check content.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText(/Campaign removed from public view/)
    expect(unpublishSender.mock.calls[0][2].expectedUpdatedAt).toBe(nextVersion)
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Duplicate content.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await screen.findByText(/Campaign deleted from the application/)
    expect(deleteSender.mock.calls[0][2].expectedUpdatedAt).toBe(thirdVersion)
  })
})
