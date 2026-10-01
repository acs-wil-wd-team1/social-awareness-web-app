import { StrictMode, useLayoutEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { getRoute } from './App.jsx'
import { clearSession, storeSession, useSession } from './services/authSession.js'

vi.mock('./pages/HomePage.jsx', () => ({ default: () => <h1>Campaign homepage</h1> }))
vi.mock('./pages/CampaignDetailsPage.jsx', () => ({ default: ({ campaignId }) => <h1>Campaign details {campaignId}</h1> }))

const tokenFor = role => `header.${btoa(JSON.stringify({ id: 1, role, exp: 9999999999 }))}.signature`
function loginAs(role) { storeSession(tokenFor(role), { id: 1, name: 'Test user', role }) }
beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('application routing', () => {
  it.each([
    ['/', 'home'], ['/login', 'login'], ['/register/', 'register'], ['/logout', 'logout'],
    ['/campaigns/new', 'create-campaign'], ['/business/campaigns/new', 'business-campaign'],
    ['/business/profile', 'business-profile'], ['/my-campaigns', 'my-campaigns'], ['/admin/campaigns', 'admin-campaigns'],
    ['/my-participation', 'my-participation'], ['/business/enquiries', 'business-enquiries'], ['/admin/users', 'admin-users'],
  ])('resolves %s as %s', (path, name) => { expect(getRoute(path)).toEqual({ name }) })

  it('resolves numeric detail routes separately from creation and admin list routes', () => {
    expect(getRoute('/campaigns/42/')).toEqual({ name: 'campaign-details', campaignId: '42' })
    expect(getRoute('/admin/campaigns/42')).toEqual({ name: 'admin-review', campaignId: '42' })
    expect(getRoute('/my-campaigns/42/edit')).toEqual({ name: 'edit-campaign', campaignId: '42' })
    expect(getRoute('/campaigns/not-an-id')).toEqual({ name: 'not-found' })
    expect(getRoute('/admin/campaigns/42/extra')).toEqual({ name: 'not-found' })
    expect(getRoute('/my-campaigns/not-an-id/edit')).toEqual({ name: 'not-found' })
  })

  it('passes the selected campaign ID into the public detail page', () => {
    render(<App pathname="/campaigns/42" />)
    expect(screen.getByRole('heading', { name: 'Campaign details 42' })).toBeTruthy()
  })

  it('shows a useful not-found page with a home link', () => {
    render(<App pathname="/missing" />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return to the homepage' }).getAttribute('href')).toBe('/')
  })
})

describe('site footer', () => {
  it.each(['/', '/campaigns/42', '/missing'])('keeps public footer links usable from %s', (pathname) => {
    render(<App pathname={pathname} />)
    const footer = within(screen.getByRole('contentinfo'))
    const links = within(footer.getByRole('navigation', { name: 'Footer navigation' }))
    expect(footer.getByText('CauseConnect', { exact: true })).toBeTruthy()
    expect(footer.getByText('Raise awareness. Create change.')).toBeTruthy()
    expect(footer.getByText('© 2026 CauseConnect')).toBeTruthy()
    expect(links.getByRole('link', { name: 'Home', exact: true }).getAttribute('href')).toBe('/')
    expect(links.getByRole('link', { name: 'Campaigns', exact: true }).getAttribute('href')).toBe('/#campaigns')
    expect(footer.getAllByRole('link')).toHaveLength(2)
    expect(footer.queryByRole('img')).toBeNull()
  })
})

describe('navigation and session updates', () => {
  it('shows public navigation and an accessible skip link for guests', () => {
    render(<App pathname="/" />)
    const nav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(nav.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page')
    expect(nav.getByRole('link', { name: 'Campaigns' }).getAttribute('href')).toBe('/#campaigns')
    expect(nav.getByRole('link', { name: 'Login' })).toBeTruthy()
    expect(nav.getByRole('link', { name: 'Register' })).toBeTruthy()
    expect(nav.queryByRole('link', { name: 'Logout' })).toBeNull()
    expect(nav.queryByRole('link', { name: 'Create campaign' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#main-content')
  })

  it.each([
    ['public', '/campaigns/new'], ['business_owner', '/business/campaigns/new'],
  ])('shows the correct author links for %s', (role, createPath) => {
    loginAs(role)
    render(<App pathname="/" />)
    const nav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(nav.getByRole('link', { name: 'Create campaign' }).getAttribute('href')).toBe(createPath)
    expect(nav.queryByRole('link', { name: 'My campaigns' })).toBeNull()
    fireEvent.click(nav.getByRole('button', { name: 'Account' }))
    expect(nav.getByRole('link', { name: 'My campaigns' }).getAttribute('href')).toBe('/my-campaigns')
    expect(nav.getByRole('link', { name: 'My participation' }).getAttribute('href')).toBe('/my-participation')
    expect(Boolean(nav.queryByRole('link', { name: 'Enquiries' }))).toBe(role === 'business_owner')
    expect(Boolean(nav.queryByRole('link', { name: 'Business profile' }))).toBe(role === 'business_owner')
    expect(nav.getByRole('link', { name: 'Logout' })).toBeTruthy()
    expect(nav.queryByRole('link', { name: 'Review campaigns' })).toBeNull()
  })

  it('shows admin review navigation without author controls', () => {
    loginAs('admin')
    render(<App pathname="/" />)
    const nav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(nav.getByRole('link', { name: 'Review campaigns' }).getAttribute('href')).toBe('/admin/campaigns')
    fireEvent.click(nav.getByRole('button', { name: 'Account' }))
    expect(nav.getByRole('link', { name: 'Manage users' }).getAttribute('href')).toBe('/admin/users')
    expect(nav.queryByRole('link', { name: 'My participation' })).toBeNull()
    expect(nav.queryByRole('link', { name: 'Create campaign' })).toBeNull()
    expect(nav.queryByRole('link', { name: 'My campaigns' })).toBeNull()
  })

  it('updates the header immediately when a user logs in and signs out', () => {
    render(<App pathname="/" />)
    act(() => loginAs('public'))
    const nav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    fireEvent.click(nav.getByRole('button', { name: 'Account' }))
    expect(nav.getByRole('link', { name: 'Logout' })).toBeTruthy()
    expect(nav.queryByRole('link', { name: 'Login' })).toBeNull()
    act(() => clearSession())
    const guestNav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(guestNav.getByRole('link', { name: 'Login' })).toBeTruthy()
    expect(guestNav.queryByRole('button', { name: 'Account' })).toBeNull()
    expect(guestNav.queryByRole('link', { name: 'Logout' })).toBeNull()
  })

  it('closes the old account panel when a different role starts a session', () => {
    loginAs('business_owner')
    render(<App pathname="/" />)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('link', { name: 'Business profile' })).toBeTruthy()
    act(() => loginAs('public'))
    expect(screen.getByRole('button', { name: 'Account' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.queryByRole('link', { name: 'Business profile' })).toBeNull()
    expect(screen.getByRole('link', { name: 'My campaigns' })).toBeTruthy()
  })

  it('removes protected navigation when the current session is rejected', () => {
    loginAs('admin')
    render(<App pathname="/" />)
    act(() => window.dispatchEvent(new CustomEvent('causeconnect:unauthorized', { detail: { token: tokenFor('admin') } })))
    const nav = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(nav.queryByRole('link', { name: 'Review campaigns' })).toBeNull()
    expect(nav.getByRole('link', { name: 'Login' })).toBeTruthy()
  })

  it('shows the supplied team logo as the accessible home link', () => {
    render(<App pathname="/" />)
    const home = screen.getByRole('link', { name: 'CauseConnect home' })
    const image = within(home).getByRole('img', { name: 'CauseConnect — Connect people. Create change.' })
    expect(home.getAttribute('href')).toBe('/')
    expect(image.getAttribute('src')).toBe('/images/brand/causeconnect-logo.png')
  })
})

describe('protected page access', () => {
  it.each([
    ['/business/enquiries', 'business_owner', {
      enquiries: [{ id: 5, campaignId: 9, businessId: 2, name: 'Contact A', email: 'contact-a@example.test', phone: null, message: 'Private account A message', createdAt: '2026-10-01T00:00:00.000Z', campaign: null }],
      page: 1, pageSize: 10, total: 1,
    }, 'Private account A message', { enquiries: [], page: 1, pageSize: 10, total: 0 }],
    ['/my-participation', 'public', {
      participations: [{ id: 4, campaignId: 8, status: 'joined', participatedAt: '2026-10-01T00:00:00.000Z', campaign: { id: 8, title: 'Private account A history', status: 'approved', type: 'cause' } }],
      page: 1, pageSize: 10, total: 1,
    }, 'Private account A history', { participations: [], page: 1, pageSize: 10, total: 0 }],
  ])('never commits previous account data under a new session at %s', async (path, role, body, privateText, nextBody) => {
    const tokenB = `header.${btoa(JSON.stringify({ id: 2, role, exp: 9999999999 }))}.signature`
    const newAccountCommits = []
    function ObservedApp() {
      const { token } = useSession()
      useLayoutEffect(() => {
        if (token === tokenB) newAccountCommits.push(document.querySelector('main')?.textContent || '')
      }, [token])
      return <App pathname={path} />
    }
    let resolveNext
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve }))
    loginAs(role)
    render(<ObservedApp />)
    await screen.findByText(privateText)
    act(() => storeSession(tokenB, { id: 2, role, name: 'Account B' }))
    expect(newAccountCommits).toHaveLength(1)
    expect(newAccountCommits[0]).not.toContain(privateText)
    expect(screen.queryByText(privateText)).toBeNull()
    await act(async () => resolveNext(new Response(JSON.stringify(nextBody), { status: 200 })))
  })

  it.each([
    ['/campaigns/new', /Log in to submit a social-cause campaign/],
    ['/business/campaigns/new', /Log in to submit a business campaign/],
    ['/business/profile', /Log in to manage your business profile/],
    ['/my-campaigns', /Log in to see your campaigns/],
    ['/admin/campaigns', /Log in to review campaigns/],
    ['/admin/campaigns/4', /Log in to review this campaign/],
    ['/my-participation', /Log in to see your participation/],
    ['/business/enquiries', /Log in to see business enquiries/],
    ['/admin/users', /Log in to manage accounts/],
    ['/my-campaigns/1/edit', /Log in to manage your campaign/],
  ])('asks guests to sign in at %s without making protected API calls', (path, message) => {
    render(<App pathname={path} />)
    expect(screen.getByText(message)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['public', '/admin/campaigns', /Admin access required/],
    ['business_owner', '/admin/campaigns/4', /Admin access required/],
    ['admin', '/my-campaigns', /Campaign author access required/],
    ['public', '/business/profile', /A business-owner account is needed/],
    ['public', '/business/campaigns/new', /A business-owner account is needed/],
    ['admin', '/campaigns/new', /A public-user account is needed/],
    ['public', '/admin/users', /Admin access required/],
    ['admin', '/my-participation', /Participation is available to public users/],
    ['public', '/business/enquiries', /A business-owner account is needed/],
    ['admin', '/my-campaigns/1/edit', /Only campaign authors can use this page/],
  ])('blocks %s from %s without protected API calls', (role, path, message) => {
    loginAs(role)
    render(<App pathname={path} />)
    expect(screen.getByText(message)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('logout in the application shell', () => {
  it('does not remount logout or claim success while server revocation is pending', async () => {
    let finish
    fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    loginAs('public')
    render(<StrictMode><App pathname="/logout" /></StrictMode>)
    act(() => window.dispatchEvent(new Event('storage')))
    expect(localStorage.getItem('token')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Ending your server session')
    expect(screen.queryByText('You’re logged out.')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => finish(new Response(null, { status: 204 })))
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
  })

  it('retains the memory-only token for retry after a failed server logout', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    loginAs('public')
    render(<StrictMode><App pathname="/logout" /></StrictMode>)
    act(() => window.dispatchEvent(new Event('storage')))
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t confirm')
    expect(screen.queryByText('You’re logged out.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry logout' }))
    expect(await screen.findByText('You’re logged out.')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${tokenFor('public')}`)
  })
})
