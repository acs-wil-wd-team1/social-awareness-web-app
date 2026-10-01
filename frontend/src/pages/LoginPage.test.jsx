
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import LoginPage from './LoginPage.jsx'
import { getSession } from '../services/authSession.js'

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
    expect(fetch).not.toHaveBeenCalled()
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
})
