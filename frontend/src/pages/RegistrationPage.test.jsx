import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App.jsx'

afterEach(() => {
  cleanup()
})

describe('CauseConnect registration page', () => {
  it('renders the registration form for the dedicated route', () => {
    render(<App pathname="/register" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. Kim Gesite')).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. kim@example.com')).toBeTruthy()
    expect(screen.getByLabelText('Password').getAttribute('type')).toBe('password')
    expect(screen.getByRole('button', { name: 'Register' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Already have an account? Login' }).getAttribute('href')).toBe('/login')
  })
})
