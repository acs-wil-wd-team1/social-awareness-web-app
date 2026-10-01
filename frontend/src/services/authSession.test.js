import { act, cleanup, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, getSession, safeReturnPath, storeSession, useSession } from './authSession.js'

const jwt = (claims) => `header.${btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`
const token = jwt({ id: 7, role: 'public', exp: 9999999999 })
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('browser sessions', () => {
  it('returns an anonymous session when no token exists', () => {
    localStorage.setItem('isLoggedIn', 'true')
    expect(getSession()).toEqual({ token: null, user: null })
  })

  it('stores only the user fields needed by the frontend and announces changes', () => {
    const changed = vi.fn()
    window.addEventListener('causeconnect:session', changed)
    storeSession(token, { id: 7, name: 'Alice', role: 'public', email: 'private@example.test', password: 'never-store-this' })
    expect(JSON.parse(localStorage.getItem('causeconnect.user'))).toEqual({ id: 7, name: 'Alice', role: 'public' })
    expect(getSession()).toEqual({ token, user: { id: 7, name: 'Alice', role: 'public' } })
    expect(changed).toHaveBeenCalledTimes(1)
    window.removeEventListener('causeconnect:session', changed)
  })

  it('recognizes business owners using the token role ahead of stale user data', () => {
    const businessToken = jwt({ id: 9, role: 'business_owner', exp: 9999999999 })
    storeSession(businessToken, { id: 7, name: 'Owner', role: 'public' })
    expect(getSession().user).toEqual({ id: 9, name: 'Owner', role: 'business_owner' })
  })

  it.each([1, 0])('treats a token with expired exp=%s as signed out', (exp) => {
    localStorage.setItem('token', jwt({ id: 7, role: 'public', exp }))
    expect(getSession()).toEqual({ token: null, user: null })
  })

  it('handles a malformed saved user without crashing', () => {
    localStorage.setItem('token', token)
    localStorage.setItem('causeconnect.user', '{broken')
    expect(getSession().user).toEqual({ id: 7, name: '', role: 'public' })
  })

  it('does not recognize arbitrary stored roles', () => {
    storeSession(jwt({ id: 7, role: 'superuser' }), { id: 7, role: 'superuser' })
    expect(getSession().user.role).toBeNull()
  })

  it('returns an anonymous session if browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    expect(getSession()).toEqual({ token: null, user: null })
  })

  it('clears saved user, token and legacy login flag and updates mounted consumers', () => {
    storeSession(token, { id: 7, role: 'public' })
    localStorage.setItem('isLoggedIn', 'true')
    const { result } = renderHook(() => useSession())
    expect(result.current.token).toBe(token)
    act(() => clearSession())
    expect(result.current).toEqual({ token: null, user: null })
    expect(localStorage.getItem('causeconnect.user')).toBeNull()
    expect(localStorage.getItem('isLoggedIn')).toBeNull()
  })

  it('updates consumers after another tab changes storage', () => {
    const { result } = renderHook(() => useSession())
    act(() => {
      localStorage.setItem('token', token)
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: token }))
    })
    expect(result.current.token).toBe(token)
  })

  it('rechecks a session changed before the subscription effect was installed', () => {
    storeSession(token, { id: 7, role: 'public' })
    const { result } = renderHook(() => {
      const session = useSession()
      useLayoutEffect(() => clearSession(), [])
      return session
    })
    expect(result.current).toEqual({ token: null, user: null })
  })

  it('does not throw during logout or unauthorized handling when browser storage becomes blocked', () => {
    storeSession(token, { id: 7, role: 'public' })
    const { result } = renderHook(() => useSession())
    const blocked = () => { throw new DOMException('Access denied', 'SecurityError') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
    expect(() => act(() => clearSession())).not.toThrow()
    expect(result.current).toEqual({ token: null, user: null })
    expect(() => act(() => window.dispatchEvent(new CustomEvent('causeconnect:unauthorized', { detail: { token } })))).not.toThrow()
  })

  it('does not retain a half-written login when saving the user fails', () => {
    storeSession(token, { id: 7, name: 'Earlier user', role: 'public' })
    const { result } = renderHook(() => useSession())
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'causeconnect.user') throw new DOMException('Storage full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    const nextToken = jwt({ id: 9, role: 'business_owner', exp: 9999999999 })
    act(() => expect(() => storeSession(nextToken, { id: 9, name: 'Next user', role: 'business_owner' })).toThrow())
    expect(getSession()).toEqual({ token: null, user: null })
    expect(result.current).toEqual({ token: null, user: null })
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('ignores an unauthorized response from an older token, but clears the current rejected one', () => {
    storeSession(token, { id: 7, role: 'public' })
    const { result } = renderHook(() => useSession())
    act(() => window.dispatchEvent(new CustomEvent('causeconnect:unauthorized', { detail: { token: 'old-token' } })))
    expect(result.current.token).toBe(token)
    act(() => window.dispatchEvent(new CustomEvent('causeconnect:unauthorized', { detail: { token } })))
    expect(result.current.token).toBeNull()
  })

  it('updates an expired session while the page remains open', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T00:00:00Z'))
    const expiring = jwt({ id: 7, role: 'public', exp: Math.floor(Date.now() / 1000) + 10 })
    storeSession(expiring, { id: 7, role: 'public' })
    const { result } = renderHook(() => useSession())
    expect(result.current.token).toBe(expiring)
    act(() => vi.advanceTimersByTime(30000))
    expect(result.current.token).toBeNull()
  })
})

describe('login return destinations', () => {
  it.each(['/campaigns/new', '/business/campaigns/new', '/admin/campaigns?status=pending', '/campaigns/4#details'])('keeps a local route: %s', (path) => {
    expect(safeReturnPath(path)).toBe(path)
  })
  it.each([null, undefined, '', 'https://evil.test', '//evil.test', '///evil.test', 'javascript:alert(1)', '/\\evil.test', '/\r/evil.test', '/\n/evil.test', '/\t/evil.test'])('rejects an external or malformed route: %s', (path) => {
    expect(safeReturnPath(path)).toBe('/')
  })
})
