import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
