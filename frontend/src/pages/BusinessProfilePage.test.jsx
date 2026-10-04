import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessProfilePage from './BusinessProfilePage.jsx'
import { validateBusinessProfile } from '../services/businessService.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const values = { businessName: 'Local shop', abn: '', website: '', description: '' }
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ business: null }))))
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Business profile', () => {
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
      businessName: 'Use 150 characters or fewer.', abn: 'Use 20 characters or fewer.', website: 'Enter a full website address starting with https:// or http://.', description: 'Use 2,000 characters or fewer.',
    })
  })
})
