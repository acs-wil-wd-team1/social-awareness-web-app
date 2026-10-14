import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessProfilePage from './BusinessProfilePage.jsx'
import { validateBusinessProfile } from '../services/businessService.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const values = { businessName: 'Local shop', abn: '', website: '', description: '' }
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ business: null }))))
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Business profile', () => {
  it.each(['load', 'save'])('treats a missing profile %s route as unavailable, not an empty profile or retryable form', async phase => {
    if (phase === 'load') fetch.mockReset().mockResolvedValueOnce(json({ code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.' }, 404))
    else fetch.mockResolvedValueOnce(json({ code: 'API_ROUTE_NOT_FOUND', message: 'API route not found.' }, 404))
    render(<BusinessProfilePage token="test" />)
    if (phase === 'save') {
      fireEvent.change(await screen.findByLabelText('Business name'), { target: { value: values.businessName } })
      fireEvent.submit(screen.getByRole('form'))
    }
    expect((await screen.findByRole('alert')).textContent).toContain('Business profile is temporarily unavailable. Please try again later.')
    expect(screen.queryByText(/until this service is connected/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Retry|Save business profile|Reload/ })).toBeNull()
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByText('API route not found.')).toBeNull()
  })

  it.each(['load', 'save'])('preserves the profile destination after a rejected %s', async phase => {
    if (phase === 'load') fetch.mockReset().mockResolvedValueOnce(json({ message: 'Session expired.' }, 401))
    else fetch.mockResolvedValueOnce(json({ message: 'Session expired.' }, 401))
    render(<BusinessProfilePage token="test" />)
    if (phase === 'save') {
      const name = await screen.findByLabelText('Business name')
      fireEvent.change(name, { target: { value: values.businessName } })
      fireEvent.submit(screen.getByRole('form'))
    }
    expect((await screen.findByRole('link', { name: 'Log in again' })).getAttribute('href')).toBe('/login?returnTo=%2Fbusiness%2Fprofile')
  })
  it.each([[null, 'business_owner', /Log in to manage/], ['test', 'public', /business-owner account is needed/]])('blocks inaccessible profiles', (token, role, message) => {
    render(<BusinessProfilePage token={token} role={role} />)
    expect(screen.getByText(message)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('creates a profile and links to business campaign posting', async () => {
    fetch.mockResolvedValueOnce(json({ business: { id: 3, ...values } }))
    render(<BusinessProfilePage token="test" />)
    await screen.findByLabelText('Business name')
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: ' Local shop ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    await screen.findByRole('heading', { name: 'Business profile saved' })
    expect(fetch.mock.calls[1][0]).toBe('/api/business/me')
    expect(fetch.mock.calls[1][1].method).toBe('PUT')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(values)
    expect(screen.getByRole('link', { name: 'Create a business campaign' }).getAttribute('href')).toBe('/business/campaigns/new')
  })

  it('loads an existing profile and saves cleared optional fields', async () => {
    fetch.mockReset().mockResolvedValueOnce(json({ business: { id: 3, ...values, website: 'https://example.com' } }))
      .mockResolvedValueOnce(json({ business: { id: 3, ...values } }))
    render(<BusinessProfilePage token="test" />)
    const website = await screen.findByLabelText(/Website/)
    expect(website.value).toBe('https://example.com')
    fireEvent.change(website, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    await screen.findByRole('heading', { name: 'Business profile saved' })
    expect(JSON.parse(fetch.mock.calls[1][1].body).website).toBe('')
  })

  it('validates and focuses fields before saving', async () => {
    render(<BusinessProfilePage token="test" />)
    await screen.findByLabelText('Business name')
    fireEvent.change(screen.getByLabelText(/Website/), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    expect(screen.getByText('Business name is required.')).toBeTruthy()
    expect(screen.getByText(/Enter a full website address/)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Business name'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shows server validation and blocks duplicate saves', async () => {
    let finish
    fetch.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    render(<BusinessProfilePage token="test" />)
    await screen.findByLabelText('Business name')
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: values.businessName } })
    fireEvent.submit(screen.getByRole('form'))
    fireEvent.submit(screen.getByRole('form'))
    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => finish(json({ message: 'Check details.', fieldErrors: { businessName: 'Name is not available.' } }, 422)))
    expect(await screen.findByText('Name is not available.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Business name')))
  })

  it('handles a load failure and retry', async () => {
    fetch.mockReset().mockRejectedValueOnce(new TypeError('Network error')).mockResolvedValueOnce(json({ business: null }))
    render(<BusinessProfilePage token="test" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry business profile' }))
    await screen.findByRole('form')
  })

  it('does not claim a profile was saved after an uncertain network result', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Network error'))
    render(<BusinessProfilePage token="test" />)
    await screen.findByLabelText('Business name')
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: values.businessName } })
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    await screen.findByText(/could not confirm whether your business profile was saved/)
    expect(screen.queryByRole('heading', { name: 'Business profile saved' })).toBeNull()
    expect(screen.getByLabelText('Business name').value).toBe(values.businessName)
  })

  it('validates lengths and website protocol', () => {
    expect(validateBusinessProfile({ ...values, website: 'https://example.com' })).toEqual({})
    expect(validateBusinessProfile({ businessName: 'a'.repeat(151), abn: 'a'.repeat(21), website: 'ftp://example.com', description: 'a'.repeat(2001) })).toEqual({
      businessName: 'Use 150 characters or fewer.', abn: 'Use 20 characters or fewer.', website: 'Enter a full website address starting with https:// or http://, without spaces, backslashes or login details.', description: 'Use 2,000 characters or fewer.',
    })
  })

  it.each([
    'https://example.com/our services', 'https://example.com/?q=local repairs', 'https://example.com/#our services',
    'http:example.com', 'https:example.com', 'https:///example.com', 'https:////example.com',
    'https://example.com\\path', 'https://\\example.com', 'https://exa\nmple.com', 'https://example.com/a\tb',
    'https://example.com/a\rb', 'https://example.com/a\u0000b', 'https://example.com/a\u007fb', 'https://example.com/our\u00a0services',
    'https://@example.com', 'https://user@example.com', 'https://user:password@example.com',
  ])('rejects a website that URL parsing would repair or expose credentials: %j', website => {
    expect(validateBusinessProfile({ ...values, website }).website).toMatch(/Enter a full website address/)
  })

  it.each([
    'https://example.com/our services', 'https://example.com\\path', 'http:example.com',
  ])('focuses the invalid website and sends no profile save: %s', async website => {
    render(<BusinessProfilePage token="test" />)
    fireEvent.change(await screen.findByLabelText('Business name'), { target: { value: values.businessName } })
    fireEvent.change(screen.getByLabelText(/Website/), { target: { value: website } })
    fireEvent.submit(screen.getByRole('form'))
    expect(await screen.findByText(/Enter a full website address/)).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Website/)))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText(/Website/).value).toBe(website)
    expect(screen.queryByRole('heading', { name: 'Business profile saved' })).toBeNull()
  })

  it.each([
    'http://example.com/', 'HTTPS://EXAMPLE.COM/', 'https://example.com/our%20services?q=local%20repairs#details',
    'https://example.com/path@public?contact=team@example.com', 'https://example.com/caf%C3%A9',
  ])('accepts a complete website and preserves encoded paths: %s', website => {
    expect(validateBusinessProfile({ ...values, website: `  ${website}  ` })).toEqual({})
  })

  it('saves a valid encoded website without decoding or changing its path', async () => {
    const website = 'https://example.com/our%20services?contact=team@example.com#details'
    fetch.mockResolvedValueOnce(json({ business: { id: 3, ...values, website } }))
    render(<BusinessProfilePage token="test" />)
    fireEvent.change(await screen.findByLabelText('Business name'), { target: { value: values.businessName } })
    fireEvent.change(screen.getByLabelText(/Website/), { target: { value: `  ${website}  ` } })
    fireEvent.submit(screen.getByRole('form'))
    await screen.findByRole('heading', { name: 'Business profile saved' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[1][1].body).website).toBe(website)
    expect(screen.getByLabelText(/Website/).value).toBe(website)
  })
})
