import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LogoutPage from './LogoutPage.jsx'
import { ApiError, apiRequest } from '../services/apiClient.js'
import { storeSession, useSession } from '../services/authSession.js'

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
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function response(status, data) {
  return { status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(data) }
}

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
    expect(apiRequest).toHaveBeenCalledWith('/api/auth/logout', { method: 'PUT', token, expectedStatus: 204 })
    await act(async () => pending.resolve(null))
    expect(screen.getByRole('status').textContent).toBe('You’re logged out.')
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'Return to home page' }).getAttribute('href')).toBe('/')
  })

  it('accepts a validated 204 response', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(null)
    render(<LogoutPage />)
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
  })

  it.each(['Session expired', 'Invalid token', 'Session expired or logged out'])('finishes logout for a server-rejected session: %s', async (message) => {
    // The browser captured an active token before the server rejected it.
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(message, { status: 401, code: 'INVALID_TOKEN' }))
    render(<LogoutPage />)
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    new ApiError('Network unavailable', { code: 'NETWORK_ERROR' }),
    new ApiError('Server error', { status: 500 }),
    new ApiError('Service unavailable', { status: 503, code: 'SERVICE_UNAVAILABLE' }),
    new ApiError('Not allowed', { status: 403, code: 'FORBIDDEN' }),
  ])('does not claim revocation after failure and retries with the memory-only token', async (error) => {
    vi.mocked(apiRequest).mockRejectedValueOnce(error).mockResolvedValueOnce(null)
    render(<LogoutPage />)
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t confirm')
    expect(localStorage.getItem('token')).toBeNull()
    expect(screen.queryByText('You’re logged out.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry logout' }))
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(apiRequest).toHaveBeenLastCalledWith('/api/auth/logout', { method: 'PUT', token, expectedStatus: 204 })
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('does not confirm logout for an unexpected 200 JSON response and retries for the required 204', async () => {
    const actual = await vi.importActual('../services/apiClient.js')
    vi.mocked(apiRequest).mockImplementation(actual.apiRequest)
    const fetch = vi.fn().mockResolvedValueOnce(response(200, { message: 'Logged out' }))
      .mockResolvedValueOnce(response(204, null))
    vi.stubGlobal('fetch', fetch)
    render(<LogoutPage />)
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t confirm')
    expect(screen.queryByText('You’re logged out.')).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry logout' }))
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
    for (const [, options] of fetch.mock.calls) expect(options.headers.Authorization).toBe(`Bearer ${token}`)
  })

  it.each([401, 503])('an old logout response %s cannot clear a newer account session', async (status) => {
    const actual = await vi.importActual('../services/apiClient.js')
    vi.mocked(apiRequest).mockImplementation(actual.apiRequest)
    const pending = deferred()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending.promise))
    const { result } = renderHook(() => useSession())
    render(<LogoutPage />)
    const newerToken = `header.${btoa(JSON.stringify({ id: 2, role: 'business_owner', exp: 9999999999 }))}.signature`
    act(() => storeSession(newerToken, { id: 2, name: 'New account', role: 'business_owner' }))
    await act(async () => pending.resolve(response(status, {
      status, code: status === 401 ? 'INVALID_TOKEN' : 'SERVICE_UNAVAILABLE', message: 'Old session response', fieldErrors: null,
    })))
    if (status === 401) expect(await screen.findByText('You’re logged out.')).toBeTruthy()
    else expect((await screen.findByRole('alert')).textContent).toContain('couldn’t confirm')
    expect(localStorage.getItem('token')).toBe(newerToken)
    expect(JSON.parse(localStorage.getItem('causeconnect.user')).id).toBe(2)
    expect(result.current.token).toBe(newerToken)
    expect(result.current.user.id).toBe(2)
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
