import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyParticipationPage from './MyParticipationPage.jsx'

const item = { id: 4, campaignId: 8, status: 'joined', participatedAt: '2026-10-01T00:00:00.000Z', campaign: { id: 8, title: 'Garden day', status: 'approved', type: 'cause' } }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const page = (participations, number = 1, total = participations.length) => ({ participations, page: number, pageSize: 10, total })
beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('My participation', () => {
  it('does not load private data for guests or admins', () => {
    const view = render(<MyParticipationPage />)
    expect(screen.getByRole('link', { name: 'Log in to see your participation' })).toBeTruthy()
    view.rerender(<MyParticipationPage token="admin" role="admin" />)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows joined/withdrawn records but links only to approved available campaigns', async () => {
    fetch.mockResolvedValueOnce(json(page([item, { ...item, id: 5, campaignId: 9, status: 'withdrawn', campaign: null }])))
    render(<MyParticipationPage token="user" role="public" />)
    await screen.findByText('Garden day')
    expect(screen.getByText('Campaign unavailable')).toBeTruthy()
    expect(screen.getByText('Withdrawn')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /View campaign/ })).toHaveLength(1)
  })

  it('paginates and refreshes an empty last page', async () => {
    fetch.mockResolvedValueOnce(json(page([item], 1, 11))).mockResolvedValueOnce(json(page([], 2, 11))).mockResolvedValueOnce(json(page([], 2, 11)))
    render(<MyParticipationPage token="user" role="business_owner" />)
    await screen.findByText('Garden day')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('No participation records on this page.')
    expect(fetch.mock.calls[1][0]).toBe('/api/participations/mine?page=2&pageSize=10')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh participation' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
  })

  it('handles session expiry as an error instead of empty history', async () => {
    fetch.mockResolvedValueOnce(json({ message: 'Expired.' }, 401))
    render(<MyParticipationPage token="user" role="public" />)
    await screen.findByRole('link', { name: 'Log in again' })
    expect(screen.queryByText('No participation records on this page.')).toBeNull()
  })

  it.each([null, { ...item.campaign, status: 'pending', title: 'Unapproved private edit' }, { ...item.campaign, status: 'rejected' }])('withdraws an existing record without disclosing an unavailable campaign: %j', async campaign => {
    fetch.mockResolvedValueOnce(json(page([{ ...item, campaign }])))
      .mockResolvedValueOnce(json({ participation: { ...item, campaign: undefined, status: 'withdrawn' } }))
    render(<MyParticipationPage token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw participation/ }))
    await screen.findByText('Withdrawn')
    expect(fetch.mock.calls[1][0]).toBe('/api/campaigns/8/participation')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ status: 'withdrawn' })
    expect(screen.queryByText('Unapproved private edit')).toBeNull()
    expect(screen.queryByRole('link', { name: /View campaign/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /join|Withdraw participation/i })).toBeNull()
    expect(screen.getByText(/First joined/)).toBeTruthy()
  })

  it('blocks duplicate clicks, refresh and pagination while withdrawal is in flight', async () => {
    let complete
    fetch.mockResolvedValueOnce(json(page([item], 1, 11))).mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
    render(<MyParticipationPage token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw participation/ }))
    fireEvent.click(screen.getByRole('button', { name: /Updating participation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh participation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true)
    await act(async () => complete(json({ participation: { ...item, status: 'withdrawn' } })))
    await screen.findByText('Withdrawn')
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false)
    expect(screen.getByRole('link', { name: /View campaign: Garden day/ })).toBeTruthy()
  })

  it.each(['network', 'server', 'malformed', 'wrong-campaign', 'wrong-status'])('requires a successful status read after an uncertain %s withdrawal', async failure => {
    fetch.mockResolvedValueOnce(json(page([{ ...item, campaign: null }])))
    if (failure === 'network') fetch.mockRejectedValueOnce(new TypeError('Connection lost'))
    else fetch.mockResolvedValueOnce(failure === 'server' ? json({ message: 'Unavailable' }, 503)
      : failure === 'malformed' ? json({})
        : json({ participation: { ...item, campaignId: failure === 'wrong-campaign' ? 99 : 8, status: failure === 'wrong-status' ? 'joined' : 'withdrawn' } }))
    fetch.mockResolvedValueOnce(json({ message: 'Still unavailable' }, 503))
      .mockResolvedValueOnce(json({ participation: { ...item, campaign: undefined, status: 'withdrawn' } }))
    render(<MyParticipationPage token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw participation/ }))
    await screen.findByText('Status unconfirmed')
    expect(screen.getByRole('button', { name: /Withdraw participation/ }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check participation status' }))
    await screen.findByText('Still unavailable')
    expect(screen.getByRole('button', { name: /Withdraw participation/ }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check participation status' }))
    await screen.findByText('Withdrawn')
    expect(fetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'PUT', 'GET', 'GET'])
    expect(screen.queryByRole('button', { name: /Withdraw participation|Check participation status/ })).toBeNull()
  })

  it('re-enables withdrawal only after a status read confirms it is still joined', async () => {
    fetch.mockResolvedValueOnce(json(page([item]))).mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce(json({ participation: item })).mockResolvedValueOnce(json({ participation: { ...item, status: 'withdrawn' } }))
    render(<MyParticipationPage token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw participation/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Check participation status' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Withdraw participation/ }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Withdraw participation/ }))
    await screen.findByText('Withdrawn')
  })

  it.each([401, 403])('blocks rejected withdrawal after access changes (%s)', async status => {
    fetch.mockResolvedValueOnce(json(page([item]))).mockResolvedValueOnce(json({ message: 'Access changed.' }, status))
    render(<MyParticipationPage token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw participation/ }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /Withdraw participation/ }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Check participation status' })).toBeNull()
    if (status === 401) expect(screen.getByRole('link', { name: 'Log in again' }).getAttribute('href')).toBe('/login?returnTo=%2Fmy-participation')
  })

  it.each(['write', 'read'])('ignores an old account\'s delayed %s completion', async stage => {
    let complete
    fetch.mockResolvedValueOnce(json(page([item])))
    if (stage === 'read') fetch.mockRejectedValueOnce(new TypeError('Connection lost'))
    fetch.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
      .mockResolvedValueOnce(json(page([])))
    const view = render(<MyParticipationPage token="first" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw participation/ }))
    if (stage === 'read') fireEvent.click(await screen.findByRole('button', { name: 'Check participation status' }))
    view.rerender(<MyParticipationPage token="second" role="business_owner" />)
    await screen.findByText('No participation records on this page.')
    await act(async () => complete(json({ participation: { ...item, status: 'withdrawn' } })))
    expect(screen.queryByText('Garden day')).toBeNull()
    expect(screen.queryByText('Withdrawn')).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh participation' }).disabled).toBe(false)
  })

  it('removes history when the same session changes to an ineligible role', async () => {
    let complete
    fetch.mockResolvedValueOnce(json(page([item]))).mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
    const view = render(<MyParticipationPage token="user" role="public" />)
    fireEvent.click(await screen.findByRole('button', { name: /Withdraw participation/ }))
    view.rerender(<MyParticipationPage token="user" role="admin" />)
    await act(async () => complete(json({ participation: { ...item, status: 'withdrawn' } })))
    expect(screen.queryByText('Garden day')).toBeNull()
    expect(screen.queryByText('Withdrawn')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
