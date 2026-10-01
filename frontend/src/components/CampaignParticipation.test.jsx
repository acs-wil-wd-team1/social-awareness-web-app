import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CampaignParticipation from './CampaignParticipation.jsx'

const campaign = { id: 8, status: 'approved', type: 'cause' }
const participation = { id: 4, campaignId: 8, status: 'joined', participatedAt: '2026-10-01T00:00:00.000Z' }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ participation: null }))))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('campaign participation', () => {
  it('provides a guest login return link and hides actions on non-cause campaigns', () => {
    const view = render(<CampaignParticipation campaign={campaign} />)
    expect(screen.getByRole('link', { name: 'Log in to join' }).getAttribute('href')).toBe('/login?returnTo=%2Fcampaigns%2F8')
    view.rerender(<CampaignParticipation campaign={{ ...campaign, type: 'business' }} token="user" role="public" />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lets a business owner join and withdraw without duplicate requests', async () => {
    let complete
    fetch.mockReturnValueOnce(new Promise((resolve) => { complete = resolve })).mockResolvedValueOnce(json({ participation: { ...participation, status: 'withdrawn' } }))
    render(<CampaignParticipation campaign={campaign} token="user" role="business_owner" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Join campaign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Updating participation…' }))
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => complete(json({ participation })))
    expect(await screen.findByText('You have joined this campaign.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw participation' }))
    await screen.findByText('You have withdrawn from this campaign.')
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ status: 'withdrawn' })
  })

  it('requires a successful status check after an uncertain write before another change', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Connection lost')).mockResolvedValueOnce(json({ participation }))
    render(<CampaignParticipation campaign={campaign} token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Join campaign' }))
    await screen.findByText(/could not confirm the change/)
    expect(screen.getByRole('button', { name: 'Join campaign' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check participation status' }))
    await screen.findByText('You have joined this campaign.')
    expect(screen.getByRole('button', { name: 'Withdraw participation' }).disabled).toBe(false)
    expect(fetch.mock.calls[2][1].method).toBe('GET')
  })

  it('handles an unavailable API and a retry without claiming participation', async () => {
    fetch.mockReset().mockResolvedValueOnce(json({ message: 'Not implemented.' }, 503)).mockResolvedValueOnce(json({ participation: null }))
    render(<CampaignParticipation campaign={campaign} token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh participation status' }))
    await screen.findByText('You have not joined this campaign yet.')
  })

  it('ignores a private response from the previous account', async () => {
    let complete
    fetch.mockReset().mockReturnValueOnce(new Promise((resolve) => { complete = resolve })).mockResolvedValueOnce(json({ participation: null }))
    const view = render(<CampaignParticipation campaign={campaign} token="old" role="public" />)
    view.rerender(<CampaignParticipation campaign={campaign} token="new" role="public" />)
    await screen.findByText('You have not joined this campaign yet.')
    await act(async () => complete(json({ participation })))
    expect(screen.queryByText('You have joined this campaign.')).toBeNull()
  })

  it('shows session expiry without enabling a join', async () => {
    fetch.mockReset().mockResolvedValueOnce(json({ message: 'Expired' }, 401))
    render(<CampaignParticipation campaign={campaign} token="expired" role="public" />)
    await screen.findByRole('link', { name: 'Log in again' })
    expect(screen.queryByRole('button', { name: 'Join campaign' })).toBeNull()
  })
})
