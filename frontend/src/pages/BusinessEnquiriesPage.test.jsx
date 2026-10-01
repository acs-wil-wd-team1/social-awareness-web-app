import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessEnquiriesPage from './BusinessEnquiriesPage.jsx'

const enquiry = { id: 5, campaignId: 9, businessId: 2, name: 'Alex', email: 'alex@example.com', phone: '+61 400 000 000', message: 'Please share the event time.', createdAt: '2026-10-01T00:00:00.000Z', campaign: { id: 9, title: 'Repair afternoon', status: 'approved' } }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const page = (enquiries) => ({ enquiries, page: 1, pageSize: 10, total: enquiries.length })
beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Business enquiries inbox', () => {
  it('loads only for a business owner', () => {
    const view = render(<BusinessEnquiriesPage token="user" role="public" />)
    expect(screen.getByText(/business-owner account is needed/)).toBeTruthy()
    view.rerender(<BusinessEnquiriesPage />)
    expect(screen.getByRole('link', { name: 'Log in to see business enquiries' })).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows private contact details and messages with no invented CRM action', async () => {
    fetch.mockResolvedValueOnce(json(page([enquiry])))
    render(<BusinessEnquiriesPage token="owner" role="business_owner" />)
    await screen.findByText('Repair afternoon')
    expect(screen.getByText('Alex')).toBeTruthy()
    expect(screen.getByText('+61 400 000 000')).toBeTruthy()
    expect(screen.getByText(enquiry.message)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'alex@example.com' }).getAttribute('href')).toBe('mailto:alex%40example.com')
    expect(screen.queryByRole('button', { name: /mark|delete|approve|reject/i })).toBeNull()
  })

  it('retries failed reads and handles an empty inbox', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Network down')).mockResolvedValueOnce(json(page([])))
    render(<BusinessEnquiriesPage token="owner" role="business_owner" />)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh enquiries' }))
    await screen.findByText('No enquiries on this page.')
  })

  it('hides public links for enquiries about campaigns that are no longer approved', async () => {
    fetch.mockResolvedValueOnce(json(page([{ ...enquiry, campaign: { ...enquiry.campaign, status: 'rejected' } }])))
    render(<BusinessEnquiriesPage token="owner" role="business_owner" />)
    await screen.findByText('Repair afternoon')
    expect(screen.queryByRole('link', { name: /View campaign/ })).toBeNull()
  })
})
