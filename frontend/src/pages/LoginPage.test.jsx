
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App.jsx'

afterEach(() => {
  cleanup()
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
})
