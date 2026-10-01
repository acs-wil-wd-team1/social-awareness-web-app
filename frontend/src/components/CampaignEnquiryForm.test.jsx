import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CampaignEnquiryForm from './CampaignEnquiryForm.jsx'

const campaign = { id: 9, status: 'approved', type: 'business' }
const enquiry = { id: 5, campaignId: 9, businessId: 2, name: 'Alex', email: 'alex@example.com', phone: null, message: 'Please share the event time.', createdAt: '2026-10-01T00:00:00.000Z' }
const json = (body, status = 201) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function fill() { for (const [label, value] of Object.entries({ Name: enquiry.name, Email: enquiry.email, Message: enquiry.message })) fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('campaign enquiry form', () => {
  it('asks guests to log in and hides the form from admins or unapproved campaigns', () => {
    const view = render(<CampaignEnquiryForm campaign={campaign} />)
    expect(screen.getByRole('link', { name: 'Log in to send an enquiry' }).getAttribute('href')).toBe('/login?returnTo=%2Fcampaigns%2F9')
    view.rerender(<CampaignEnquiryForm campaign={campaign} token="admin" role="admin" />)
    expect(screen.queryByRole('form')).toBeNull()
    view.rerender(<CampaignEnquiryForm campaign={{ ...campaign, status: 'pending' }} token="user" role="public" />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('explains who receives the details, validates fields and focuses the first error', () => {
    render(<CampaignEnquiryForm campaign={campaign} token="user" role="public" />)
    expect(screen.getByText(/business owner will receive your name, email/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
    expect(screen.getByText('Name is required.')).toBeTruthy()
    expect(screen.getByText('Email is required.')).toBeTruthy()
    expect(screen.getByText('Message is required.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends one enquiry and confirms only the returned receipt', async () => {
    let complete
    fetch.mockReturnValueOnce(new Promise((resolve) => { complete = resolve }))
    render(<CampaignEnquiryForm campaign={campaign} token="user" role="public" />)
    fill(); fireEvent.submit(screen.getByRole('form')); fireEvent.submit(screen.getByRole('form'))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Sending enquiry…' }).disabled).toBe(true)
    await act(async () => complete(json({ enquiry })))
    expect(await screen.findByRole('heading', { name: 'Enquiry sent' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('status'))
  })

  it('requires explicit acknowledgement of duplicate risk after an uncertain POST', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Connection lost')).mockResolvedValueOnce(json({ enquiry }))
    render(<CampaignEnquiryForm campaign={campaign} token="user" role="public" />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
    await screen.findByText(/enquiry may already have been sent/)
    expect(screen.getByRole('button', { name: 'Send enquiry' }).disabled).toBe(true)
    fireEvent.submit(screen.getByRole('form'))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Message').value).toBe(enquiry.message)
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand and want to try sending again.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
    await screen.findByRole('heading', { name: 'Enquiry sent' })
  })

  it('preserves data and focuses a server field error', async () => {
    fetch.mockResolvedValueOnce(json({ message: 'Check your details.', fieldErrors: { email: 'This email cannot receive replies.' } }, 422))
    render(<CampaignEnquiryForm campaign={campaign} token="user" role="business_owner" />)
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
    await screen.findByText('This email cannot receive replies.')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email')))
    expect(screen.getByLabelText('Name').value).toBe('Alex')
  })

  it('clears private form values when the account changes', () => {
    const view = render(<CampaignEnquiryForm campaign={campaign} token="old" role="public" />)
    fill()
    view.rerender(<CampaignEnquiryForm campaign={campaign} token="new" role="public" />)
    expect(screen.getByLabelText('Email').value).toBe('')
    expect(screen.getByLabelText('Message').value).toBe('')
  })
})
