import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import RegistrationPage from './RegistrationPage.jsx'

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(body) })
const publicUser = { id: 5, name: 'Alex', role: 'public' }
function fillRegistration({ type = 'user', name = ' Alex ', email = 'alex@example.test', confirmPassword = 'Password123!' } = {}) {
  fireEvent.change(screen.getByLabelText('Account type'), { target: { value: type } })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123!' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmPassword } })
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/register')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('CauseConnect registration page', () => {
  it('renders the registration form for the dedicated route', () => {
    render(<App pathname="/register" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. Kim Gesite')).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. kim@example.com')).toBeTruthy()
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password')
    expect(screen.getByLabelText('Name').maxLength).toBe(100)
    expect(screen.getByLabelText('Email').maxLength).toBe(150)
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Already have an account? Login' }).getAttribute('href')).toBe('/login')
  })

  it('does not contact the API for missing fields or mismatched passwords', () => {
    render(<RegistrationPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getAllByText('This field is required.')).toHaveLength(4)
    fillRegistration({ confirmPassword: 'Different password' })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText('Passwords do not match.')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['/campaigns/3', '/campaigns/3?source=community&topic=Green%20space#enquiry'])('keeps the destination in both login links after signup: %s', async (destination) => {
    window.history.replaceState({}, '', `/register?returnTo=${encodeURIComponent(destination)}`)
    vi.mocked(fetch).mockResolvedValue(response(201, { user: publicUser }))
    render(<RegistrationPage />)
    const loginPath = `/login?returnTo=${encodeURIComponent(destination)}`
    expect(screen.getByRole('link', { name: 'Already have an account? Login' }).getAttribute('href')).toBe(loginPath)
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('link', { name: 'Continue to login' })).getAttribute('href')).toBe(loginPath)
  })

  it.each(['https://evil.test', '//evil.test', '/\\evil.test'])('does not forward an unsafe destination after signup: %s', async (destination) => {
    window.history.replaceState({}, '', `/register?returnTo=${encodeURIComponent(destination)}`)
    vi.mocked(fetch).mockResolvedValue(response(201, { user: publicUser }))
    render(<RegistrationPage />)
    expect(screen.getByRole('link', { name: 'Already have an account? Login' }).getAttribute('href')).toBe('/login')
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('link', { name: 'Continue to login' })).getAttribute('href')).toBe('/login')
  })

  it('accepts trimmed name and email at the database length limits', async () => {
    const name = 'N'.repeat(100)
    const email = `alex@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(12)}.test`
    expect(email.length).toBe(150)
    vi.mocked(fetch).mockResolvedValue(response(201, { user: publicUser }))
    render(<RegistrationPage />)
    fillRegistration({ name: ` ${name} `, email: ` ${email} ` })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('status')).textContent).toContain('Registration successful')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ name, email })
  })

  it.each([
    ['Name', { name: 'N'.repeat(101) }, 'Use 100 characters or fewer.'],
    ['Email', { email: `alex@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(13)}.test` }, 'Use 150 characters or fewer.'],
  ])('rejects an over-limit %s even when the input limit is bypassed', (label, values, message) => {
    render(<RegistrationPage />)
    fillRegistration(values)
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('clears a length error when the field is corrected', () => {
    render(<RegistrationPage />)
    fillRegistration({ name: 'N'.repeat(101) })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByText('Use 100 characters or fewer.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alex' } })
    expect(screen.queryByText('Use 100 characters or fewer.')).toBeNull()
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('false')
  })

  it.each([['user', 'public'], ['business', 'business_owner']])('sends accountType=%s and confirms the matching %s account', async (type, role) => {
    vi.mocked(fetch).mockResolvedValue(response(201, { user: { ...publicUser, role } }))
    render(<RegistrationPage />)
    fillRegistration({ type })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('status')).textContent).toContain('Registration successful')
    expect(fetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alex', email: 'alex@example.test', password: 'Password123!', accountType: type }),
    }))
    expect(screen.getByRole('link', { name: 'Continue to login' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('button', { name: 'Register' }).disabled).toBe(true)
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('keeps registration pending until the server confirms account creation', async () => {
    let resolve
    vi.mocked(fetch).mockReturnValue(new Promise(done => { resolve = done }))
    render(<RegistrationPage />)
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByRole('button', { name: 'Registering...' }).disabled).toBe(true)
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => resolve(response(201, { user: publicUser })))
    expect(screen.getByRole('status').textContent).toContain('Registration successful')
  })

  it.each([['user', 'business_owner'], ['business', 'public']])('does not confirm a %s registration returned as %s', async (type, role) => {
    vi.mocked(fetch).mockResolvedValue(response(201, { user: { ...publicUser, role } }))
    render(<RegistrationPage />)
    fillRegistration({ type })
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Try logging in before registering again')
    expect(screen.queryByRole('status')).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it.each([
    [200, { user: publicUser }], [204, null], [201, {}],
    [201, { user: { id: '5', role: 'public' } }],
    [201, { user: { id: -1, role: 'public' } }],
    [201, { user: { id: 5, role: 'admin' } }],
  ])('does not claim success for an invalid creation response (%s, %j)', async (status, body) => {
    vi.mocked(fetch).mockResolvedValue(response(status, body))
    render(<RegistrationPage />)
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Register' }).disabled).toBe(false)
  })

  it('shows the duplicate-email field error without reporting a successful account', async () => {
    vi.mocked(fetch).mockResolvedValue(response(409, { message: 'Unable to create your account', code: 'EMAIL_EXISTS', fieldErrors: { email: 'Email is already registered.' } }))
    render(<RegistrationPage />)
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByText('Email is already registered.')).toBeTruthy()
    expect(screen.getAllByText('Email is already registered.')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Unable to create your account')
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('allows editing after success by clearing the confirmation and enabling the form', async () => {
    vi.mocked(fetch).mockResolvedValue(response(201, { user: publicUser }))
    render(<RegistrationPage />)
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    await screen.findByRole('status')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'another@example.test' } })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Register' }).disabled).toBe(false)
  })

  it('leaves the user in control of continuing to login without a timed redirect', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValue(response(201, { user: publicUser }))
    render(<RegistrationPage />)
    fillRegistration()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Register' })))
    expect(screen.getByRole('status').textContent).toContain('Registration successful')
    await act(async () => vi.advanceTimersByTimeAsync(10000))
    expect(window.location.pathname).toBe('/register')
    expect(screen.getByRole('link', { name: 'Continue to login' })).toBeTruthy()
    expect(localStorage.getItem('token')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('offers an error and retryable form when the API is unavailable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Network offline'))
    render(<RegistrationPage />)
    fillRegistration()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be reached')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Register' }).disabled).toBe(false)
  })
})
