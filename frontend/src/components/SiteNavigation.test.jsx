import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SiteNavigation from './SiteNavigation.jsx'

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/') })

function businessNav() {
  return render(<><SiteNavigation token="sample" role="business_owner" route={{ name: 'business-enquiries' }} createPath="/business/campaigns/new" /><button>Outside navigation</button></>)
}

describe('account navigation disclosure', () => {
  it.each(['login', 'register'])('keeps the campaign destination in the %s header links too', route => {
    window.history.replaceState({}, '', `/${route}?returnTo=%2Fcampaigns%2F2`)
    render(<SiteNavigation route={{ name: route }} />)
    expect(screen.getByRole('link', { name: 'Register' }).getAttribute('href')).toBe('/register?returnTo=%2Fcampaigns%2F2')
    expect(screen.getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/login?returnTo=%2Fcampaigns%2F2')
  })

  it('does not propagate an unsafe return destination through the header', () => {
    window.history.replaceState({}, '', '/login?returnTo=https%3A%2F%2Fevil.example')
    render(<SiteNavigation route={{ name: 'login' }} />)
    expect(screen.getByRole('link', { name: 'Register' }).getAttribute('href')).toBe('/register')
    expect(screen.getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/login')
  })

  it('keeps account links out of the tab order until opened, with the current page identified', () => {
    businessNav()
    const toggle = screen.getByRole('button', { name: 'Account' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link', { name: 'Enquiries' })).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Enquiries' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'My campaigns' }).getAttribute('aria-current')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: 'Logout' })).toBeNull()
  })

  it('closes with Escape and returns focus to the toggle', () => {
    businessNav()
    const toggle = screen.getByRole('button', { name: 'Account' })
    fireEvent.click(toggle)
    const link = screen.getByRole('link', { name: 'Enquiries' })
    act(() => link.focus())
    fireEvent.keyDown(link, { key: 'Escape' })
    expect(screen.queryByRole('link', { name: 'Enquiries' })).toBeNull()
    expect(document.activeElement).toBe(toggle)
  })

  it('stays open when focus moves inside, and closes when focus leaves', () => {
    businessNav()
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    act(() => screen.getByRole('link', { name: 'My campaigns' }).focus())
    act(() => screen.getByRole('link', { name: 'Enquiries' }).focus())
    expect(screen.getByRole('button', { name: 'Account' }).getAttribute('aria-expanded')).toBe('true')
    act(() => screen.getByRole('button', { name: 'Outside navigation' }).focus())
    expect(screen.getByRole('button', { name: 'Account' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('closes after an outside pointer action', () => {
    businessNav()
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside navigation' }))
    expect(screen.queryByRole('link', { name: 'Logout' })).toBeNull()
  })
})
