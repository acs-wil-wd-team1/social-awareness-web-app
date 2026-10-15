
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import App from '../App.jsx'
import LoginPage from './LoginPage.jsx'
import { clearSession, getSession, getSessionGeneration, SESSION_GENERATION_KEY, storeSession } from '../services/authSession.js'

const token = `header.${btoa(JSON.stringify({ id: 7, role: 'business_owner', exp: 9999999999 }))}.signature`
const validBody = { token, user: { id: 7, name: 'Sam', role: 'business_owner' } }
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(body) })
function fillLogin({ email = 'sam@example.test', password = 'Password123!' } = {}) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}
beforeEach(() => {
  localStorage.clear()
  // Successful navigation to '/' changes only the hash in jsdom.
  window.history.replaceState({}, '', '/#before-login')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CauseConnect login page', () => {
  it('renders the login form for the dedicated route', () => {
    render(<App pathname="/login" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Login' })).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. kim@example.com')).toBeTruthy()
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password')
    expect(screen.getByRole('button', { name: 'Login' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: "Don't have an account? Register" }).getAttribute('href')
    ).toBe('/register')
  })

  it('validates required fields before calling the API', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(screen.getAllByText('This field is required.')).toHaveLength(2)
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe('login-email-error')
    expect(screen.getByText('Please correct the highlighted fields before logging in.').getAttribute('aria-live')).toBe('polite')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['/campaigns/3', '/campaigns/3?source=community&topic=Green%20space#enquiry'])('keeps the destination when switching to registration: %s', (destination) => {
    window.history.replaceState({}, '', `/login?returnTo=${encodeURIComponent(destination)}`)
    render(<LoginPage />)
    const link = screen.getByRole('link', { name: "Don't have an account? Register" })
    expect(link.getAttribute('href')).toBe(`/register?returnTo=${encodeURIComponent(destination)}`)
  })

  it.each(['https://evil.test', '//evil.test', '/\\evil.test'])('drops an unsafe destination from registration links: %s', (destination) => {
    window.history.replaceState({}, '', `/login?returnTo=${encodeURIComponent(destination)}`)
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: "Don't have an account? Register" }).getAttribute('href')).toBe('/register')
  })

  it('posts login credentials and stores the returned user and token after HTTP 200', async () => {
    vi.mocked(fetch).mockResolvedValue(response(200, validBody))
    const changed = vi.fn()
    window.addEventListener('causeconnect:session', changed)
    render(<LoginPage />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sam@example.test', password: 'Password123!' }),
    }))
    expect(getSession()).toEqual({ token, user: validBody.user })
    expect(changed).toHaveBeenCalledTimes(1)
    window.removeEventListener('causeconnect:session', changed)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(localStorage.getItem('isLoggedIn')).toBeNull()
  })

  it('shows pending state without creating a browser session before the server responds', async () => {
    let resolve
    vi.mocked(fetch).mockReturnValue(new Promise(done => { resolve = done }))
    render(<LoginPage />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(screen.getByRole('button', { name: 'Logging in...' }).disabled).toBe(true)
    expect(localStorage.getItem('token')).toBeNull()
    await act(async () => resolve(response(401, { message: 'Email or password is incorrect.' })))
    expect(screen.getByRole('alert').textContent).toBe('Email or password is incorrect.')
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
  })

  it('makes only one login request while a submission is pending', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const { container } = render(<LoginPage />)
    fillLogin()
    fireEvent.submit(container.querySelector('form'))
    fireEvent.submit(container.querySelector('form'))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => resolve(response(401, { message: 'Email or password is incorrect.' })))
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
  })

  it('does not store or redirect a delayed successful login after unmount', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const view = render(<LoginPage />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const signal = fetch.mock.calls[0][1].signal
    view.unmount()
    expect(signal.aborted).toBe(true)
    const newerToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`
    storeSession(newerToken, { id: 9, name: 'Newer account', role: 'public' })
    // Even a transport that resolves after cancellation must not commit this login.
    await act(async () => resolve(response(200, validBody)))
    expect(getSession().token).toBe(newerToken)
    expect(getSession().user.id).toBe(9)
    expect(window.location.hash).toBe('#before-login')
  })

  it('keeps a newer session when storage changes without unmounting the login form', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(<LoginPage />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const newerToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`
    storeSession(newerToken, { id: 9, name: 'Newer account', role: 'public' })
    await act(async () => resolve(response(200, validBody)))
    expect(getSession().token).toBe(newerToken)
    expect(getSession().user.id).toBe(9)
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('cancels the old App login when another tab changes the account', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(<App pathname="/login" />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const signal = fetch.mock.calls[0][1].signal
    const newerToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`
    await act(async () => {
      localStorage.setItem('token', newerToken)
      localStorage.setItem('causeconnect.user', JSON.stringify({ id: 9, name: 'Newer account', role: 'public' }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: newerToken }))
    })
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(response(200, validBody)))
    expect(getSession().token).toBe(newerToken)
    expect(getSession().user.id).toBe(9)
    expect(window.location.hash).toBe('#before-login')
  })

  it('does not restore a delayed guest login after queued cross-tab login and logout changes', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(<App pathname="/login" />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const signal = fetch.mock.calls[0][1].signal
    const newerToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`
    await act(async () => {
      // By the time this tab receives the other tab's queued storage events,
      // the durable session has already returned to its original guest state.
      localStorage.setItem('token', newerToken)
      localStorage.setItem('causeconnect.user', JSON.stringify({ id: 9, name: 'Newer account', role: 'public' }))
      localStorage.removeItem('token')
      localStorage.removeItem('causeconnect.user')
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: null, newValue: newerToken }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: newerToken, newValue: null }))
    })
    expect(signal.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
    expect(screen.getByRole('alert').textContent).toContain('another tab changed the login session')
    expect(getSession().token).toBeNull()
    await act(async () => resolve(response(200, validBody)))
    expect.soft(getSession().token).toBeNull()
    expect.soft(window.location.hash).toBe('#before-login')
  })

  it('does not restore a guest login when cross-tab session events arrive after its response', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(<App pathname="/login" />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const signal = fetch.mock.calls[0][1].signal
    const newerToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`

    // These app-managed changes occur in the other tab: its local custom
    // notifications do not reach this tab, and its storage events are queued.
    const dispatchEvent = window.dispatchEvent
    const sourceTabEvents = vi.spyOn(window, 'dispatchEvent').mockImplementation(event =>
      event.type === 'causeconnect:session' ? true : dispatchEvent.call(window, event))
    try {
      storeSession(newerToken, { id: 9, name: 'Newer account', role: 'public' })
      clearSession()
    } finally {
      sourceTabEvents.mockRestore()
    }
    expect(getSession()).toEqual({ token: null, user: null })
    expect(signal.aborted).toBe(false)

    // The networking task and its promise continuation run before delivery
    // of the already queued storage events from the completed login/logout.
    await act(async () => resolve(response(200, validBody)))
    expect.soft(getSession()).toEqual({ token: null, user: null })
    expect.soft(window.location.hash).toBe('#before-login')
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: null, newValue: newerToken, storageArea: window.localStorage }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: newerToken, newValue: null, storageArea: window.localStorage }))
    })
    expect.soft(getSession()).toEqual({ token: null, user: null })
    expect.soft(window.location.hash).toBe('#before-login')
  })

  it('invalidates a pending login after an external storage clear before its event and allows a fresh retry', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(<App pathname="/login" />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(getSessionGeneration()).not.toBeNull()
    localStorage.clear()
    await act(async () => resolve(response(200, validBody)))
    expect(getSession()).toEqual({ token: null, user: null })
    expect(getSessionGeneration()).toBeNull()
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)

    fetch.mockResolvedValueOnce(response(200, validBody))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(getSession()).toEqual(validBody)
    expect(window.location.hash).toBe('')
  })

  it('does not accept a response when its saved generation can no longer be read', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(<App pathname="/login" />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === SESSION_GENERATION_KEY) throw new DOMException('Access denied', 'SecurityError')
      return getItem.call(this, key)
    })
    const write = vi.spyOn(Storage.prototype, 'setItem')
    await act(async () => resolve(response(200, validBody)))
    expect(write).not.toHaveBeenCalled()
    expect(getSession()).toEqual({ token: null, user: null })
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
  })

  it('ignores unrelated storage and notice events while a login is pending', async () => {
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(<App pathname="/login" />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const signal = fetch.mock.calls[0][1].signal
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-key', newValue: 'changed' }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: 'unrelated-session-storage', storageArea: window.sessionStorage }))
      window.dispatchEvent(new Event('causeconnect:session-notice-dismissed'))
    })
    expect(signal.aborted).toBe(false)
    expect(screen.getByRole('button', { name: 'Logging in...' }).disabled).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => resolve(response(200, validBody)))
    expect(getSession()).toEqual({ token, user: validBody.user })
    expect(window.location.hash).toBe('')
  })

  it('allows a fresh StrictMode retry after a cross-tab clear without an old finally unlocking it', async () => {
    let resolveOld, resolveNew
    fetch.mockReturnValueOnce(new Promise(done => { resolveOld = done }))
      .mockReturnValueOnce(new Promise(done => { resolveNew = done }))
    render(<StrictMode><App pathname="/login" /></StrictMode>)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const oldSignal = fetch.mock.calls[0][1].signal
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: window.localStorage })))
    expect(oldSignal.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
    fillLogin({ email: 'fresh@example.test' })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(fetch).toHaveBeenCalledTimes(2)
    const newSignal = fetch.mock.calls[1][1].signal
    await act(async () => resolveOld(response(200, validBody)))
    expect(getSession().token).toBeNull()
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getByRole('button', { name: 'Logging in...' }).disabled).toBe(true)
    expect(newSignal.aborted).toBe(false)
    const freshToken = `header.${btoa(JSON.stringify({ id: 11, role: 'public', exp: 9999999999 }))}.signature`
    const freshBody = { token: freshToken, user: { id: 11, name: 'Fresh account', role: 'public' } }
    await act(async () => resolveNew(response(200, freshBody)))
    expect(getSession()).toEqual(freshBody)
    expect(window.location.hash).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still stores and redirects a normal App login through the session remount', async () => {
    fetch.mockResolvedValueOnce(response(200, validBody))
    render(<App pathname="/login" />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(getSession()).toEqual({ token, user: validBody.user })
    expect(window.location.hash).toBe('')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('allows an intentional login to replace the unchanged starting session', async () => {
    const startingToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`
    storeSession(startingToken, { id: 9, name: 'Starting account', role: 'public' })
    fetch.mockResolvedValueOnce(response(200, validBody))
    render(<App pathname="/login" />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(getSession()).toEqual({ token, user: validBody.user })
    expect(window.location.hash).toBe('')
  })

  it('still explains blocked browser storage instead of claiming a successful login', async () => {
    fetch.mockResolvedValueOnce(response(200, validBody))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
    render(<LoginPage />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(screen.getByRole('alert').textContent).toContain('Allow site storage and try again')
    expect(getSession().token).toBeNull()
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
  })

  it.each(['getItem', 'setItem'])('does not send a login when generation preflight %s fails and allows a fresh retry', async method => {
    const original = Storage.prototype[method]
    const blocked = vi.spyOn(Storage.prototype, method).mockImplementation(function (key, ...args) {
      if (key === SESSION_GENERATION_KEY) throw new DOMException('Access denied', 'SecurityError')
      return original.call(this, key, ...args)
    })
    render(<App pathname="/login" />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(fetch).not.toHaveBeenCalled()
    expect(getSession()).toEqual({ token: null, user: null })
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toContain('Allow site storage and try again')
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)

    blocked.mockRestore()
    fetch.mockResolvedValueOnce(response(200, validBody))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(getSession()).toEqual(validBody)
    expect(window.location.hash).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['standalone', 'shell'])('keeps its own generation commit failure visible in the %s and allows retry', async surface => {
    const startingToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`
    storeSession(startingToken, { id: 9, name: 'Starting account', role: 'public' })
    let resolve
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done }))
    render(surface === 'shell' ? <App pathname="/login" /> : <LoginPage />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    const setItem = Storage.prototype.setItem
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SESSION_GENERATION_KEY) throw new DOMException('Storage full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    await act(async () => resolve(response(200, validBody)))
    expect(getSessionGeneration()).toBeNull()
    expect(getSession()).toEqual({ token: null, user: null })
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toContain('Allow site storage and try again')
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)

    blocked.mockRestore()
    fetch.mockResolvedValueOnce(response(200, validBody))
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(getSession()).toEqual(validBody)
    expect(window.location.hash).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps storage-failure feedback visible when a failed account switch clears the starting session', async () => {
    const startingToken = `header.${btoa(JSON.stringify({ id: 9, role: 'public', exp: 9999999999 }))}.signature`
    storeSession(startingToken, { id: 9, name: 'Starting account', role: 'public' })
    const originalSetItem = Storage.prototype.setItem
    const blockedStorage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'causeconnect.user') throw new Error('Storage quota exceeded')
      return originalSetItem.call(this, key, value)
    })
    fetch.mockResolvedValueOnce(response(200, validBody))
    render(<App pathname="/login" />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    // The second write failed after saving the new token. Fail closed instead
    // of leaving that token paired with the previous account's saved details.
    expect(getSession().token).toBeNull()
    expect(localStorage.getItem('causeconnect.user')).toBeNull()
    expect(window.location.hash).toBe('#before-login')
    expect(screen.getByRole('alert').textContent).toContain('Allow site storage and try again')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    blockedStorage.mockRestore()
    fetch.mockResolvedValueOnce(response(401, { message: 'Email or password is incorrect.' }))
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Email or password is incorrect.')
    expect(screen.queryByText(/Allow site storage and try again/)).toBeNull()
    expect(getSession().token).toBeNull()
  })

  it('shows only the shell storage notice for a guest failure without a session remount', async () => {
    fetch.mockResolvedValueOnce(response(200, validBody))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
    render(<App pathname="/login" />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').closest('main')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('Allow site storage and try again')
    expect(getSession().token).toBeNull()
    expect(window.location.hash).toBe('#before-login')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss sign-in message' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false)
  })

  it('does not hide an ordinary API error with the same text as a storage notice', async () => {
    const message = 'Your browser could not save the login. Allow site storage and try again.'
    fetch.mockResolvedValueOnce(response(500, { message }))
    render(<App pathname="/login" />)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').closest('main')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(message)
    expect(screen.queryByRole('button', { name: 'Dismiss sign-in message' })).toBeNull()
  })

  it('accepts a normal login after StrictMode repeats effect setup', async () => {
    fetch.mockResolvedValueOnce(response(200, validBody))
    render(<StrictMode><LoginPage /></StrictMode>)
    fillLogin()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Login' })))
    expect(getSession()).toEqual({ token, user: validBody.user })
    expect(window.location.hash).toBe('')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    [200, { user: validBody.user }],
    [200, { token: {}, user: validBody.user }],
    [200, { token: ' ', user: validBody.user }],
    [200, { token, user: { id: '7', role: 'public' } }],
    [200, { token, user: { id: -1, role: 'public' } }],
    [200, { token, user: { id: 7, role: 'unknown' } }],
    [201, validBody], [204, null],
  ])('does not store a session for an invalid login response (%s, %j)', async (status, body) => {
    vi.mocked(fetch).mockResolvedValue(response(status, body))
    render(<LoginPage />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('causeconnect.user')).toBeNull()
  })

  it('shows server validation next to the affected field and clears the alert when edited', async () => {
    vi.mocked(fetch).mockResolvedValue(response(422, { message: 'Check the login details.', fieldErrors: { email: 'This email cannot be used.' } }))
    render(<LoginPage />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByText('This email cannot be used.')).toBeTruthy()
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.test' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('keeps the user signed out if the API cannot be reached', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Network offline'))
    render(<LoginPage />)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be reached')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false))
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('still submits existing short passwords without applying new registration policy to login', async () => {
    fetch.mockResolvedValue(response(401, { message: 'Email or password is incorrect.' }))
    render(<LoginPage />)
    fillLogin({ password: 'oldpass' })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    await screen.findByRole('alert')
    expect(JSON.parse(fetch.mock.calls[0][1].body).password).toBe('oldpass')
    expect(screen.queryByText(/Use at least 15/)).toBeNull()
  })
})
