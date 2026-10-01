import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LogoutPage from './LogoutPage.jsx'
import { ApiError, apiRequest } from '../services/apiClient.js'

vi.mock('../services/apiClient.js', async (importOriginal) => ({
  ...await importOriginal(), apiRequest: vi.fn(),
}))

const token = `header.${btoa(JSON.stringify({ id: 1, role: 'public', exp: 9999999999 }))}.signature`
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(apiRequest).mockReset()
  localStorage.setItem('token', token)
  localStorage.setItem('causeconnect.user', JSON.stringify({ id: 1, role: 'public' }))
  localStorage.setItem('isLoggedIn', 'true')
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

describe('LogoutPage', () => {
  it('clears browser session immediately and waits for confirmed revocation', async () => {
    const pending = deferred()
    vi.mocked(apiRequest).mockReturnValueOnce(pending.promise)
    const changed = vi.fn()
    window.addEventListener('causeconnect:session', changed)
    render(<LogoutPage />)
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('causeconnect.user')).toBeNull()
    expect(localStorage.getItem('isLoggedIn')).toBeNull()
    expect(changed).toHaveBeenCalled()
    window.removeEventListener('causeconnect:session', changed)
    expect(screen.getByRole('status').textContent).toContain('Ending your server session')
    expect(screen.queryByText('You’re logged out.')).toBeNull()
    expect(apiRequest).toHaveBeenCalledWith('/api/auth/logout', { method: 'PUT', token })
    await act(async () => pending.resolve(null))
    expect(screen.getByRole('status').textContent).toBe('You’re logged out.')
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'Return to home page' }).getAttribute('href')).toBe('/')
  })

  it.each([null, { message: 'Logged out' }])('accepts a validated 204 or JSON success response (%j)', async (body) => {
    vi.mocked(apiRequest).mockResolvedValueOnce(body)
    render(<LogoutPage />)
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
  })

  it('treats an already expired or revoked server session as complete', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError('Session expired', { status: 401 }))
    render(<LogoutPage />)
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    new ApiError('Network unavailable', { code: 'NETWORK_ERROR' }),
    new ApiError('Server error', { status: 500 }),
  ])('does not claim revocation after failure and retries with the memory-only token', async (error) => {
    vi.mocked(apiRequest).mockRejectedValueOnce(error).mockResolvedValueOnce(null)
    render(<LogoutPage />)
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t confirm')
    expect(localStorage.getItem('token')).toBeNull()
    expect(screen.queryByText('You’re logged out.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry logout' }))
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(apiRequest).toHaveBeenLastCalledWith('/api/auth/logout', { method: 'PUT', token })
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('makes one request when StrictMode repeats the effect', async () => {
    const pending = deferred()
    vi.mocked(apiRequest).mockReturnValue(pending.promise)
    render(<StrictMode><LogoutPage /></StrictMode>)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve(null))
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
  })

  it('does not call the API without an active browser session', async () => {
    localStorage.clear()
    render(<LogoutPage />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('You’re logged out.'))
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('allows an in-flight server logout to finish after navigation', async () => {
    const pending = deferred()
    vi.mocked(apiRequest).mockReturnValueOnce(pending.promise)
    const view = render(<LogoutPage />)
    view.unmount()
    await act(async () => pending.resolve(null))
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBeNull()
  })
})
