import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadParticipation, setParticipation, loadMyParticipation, loadBusinessEnquiries, sendCampaignEnquiry, validateEnquiry } from './engagementService.js'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const participation = { id: 4, campaignId: 8, status: 'joined', participatedAt: '2026-10-01T00:00:00.000Z' }
const enquiry = { id: 5, campaignId: 9, businessId: 2, name: 'Alex', email: 'alex@example.com', phone: null, message: 'Please share the event time.', createdAt: '2026-10-01T00:00:00.000Z' }
beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('engagement API contracts', () => {
  it('reads null participation and sends only the chosen status when joining', async () => {
    fetch.mockResolvedValueOnce(json({ participation: null })).mockResolvedValueOnce(json({ participation }))
    await expect(loadParticipation(8, { token: 'user' })).resolves.toBeNull()
    await expect(setParticipation(8, 'joined', { token: 'user' })).resolves.toEqual(participation)
    expect(fetch.mock.calls[1][0]).toBe('/api/campaigns/8/participation')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ status: 'joined' })
  })

  it.each([{ ...participation, campaignId: 9 }, { ...participation, id: '4' }, { ...participation, status: 'pending' }, { ...participation, participatedAt: 'yesterday' }])('rejects inconsistent participation response %j', async (record) => {
    fetch.mockResolvedValueOnce(json({ participation: record }))
    await expect(loadParticipation(8, { token: 'user' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('rejects a successful write response with a different participation status', async () => {
    fetch.mockResolvedValueOnce(json({ participation: { ...participation, status: 'withdrawn' } }))
    await expect(setParticipation(8, 'joined', { token: 'user' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('requires authentication and valid campaign IDs before sending requests', async () => {
    await expect(loadParticipation(8)).rejects.toMatchObject({ status: 401 })
    await expect(loadParticipation('../admin', { token: 'user' })).rejects.toMatchObject({ status: 404 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('validates names, email, phone and message without treating an omitted phone as an error', () => {
    expect(validateEnquiry({ name: 'Alex', email: 'alex@example.com', message: 'Interested' })).toEqual({})
    expect(validateEnquiry({ name: '', email: 'invalid', phone: '1'.repeat(21), message: 'a'.repeat(2001) })).toEqual({
      name: 'Name is required.', email: 'Enter a valid email address of no more than 150 characters.', phone: 'Use 20 characters or fewer.', message: 'Use 2,000 characters or fewer.',
    })
  })

  it('normalises enquiry input and excludes client ownership or status', async () => {
    fetch.mockResolvedValueOnce(json({ enquiry }, 201))
    await expect(sendCampaignEnquiry(9, { name: ' Alex ', email: ' ALEX@EXAMPLE.COM ', message: enquiry.message, userId: 999, status: 'won' }, { token: 'user' })).resolves.toEqual(enquiry)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ name: 'Alex', email: 'alex@example.com', message: enquiry.message })
  })

  it.each([{ ...enquiry, campaignId: 99 }, { ...enquiry, phone: undefined }, { ...enquiry, message: 'Different message' }])('does not confirm an inconsistent enquiry receipt', async (record) => {
    fetch.mockResolvedValueOnce(json({ enquiry: record }, 201))
    await expect(sendCampaignEnquiry(9, { name: enquiry.name, email: enquiry.email, message: enquiry.message }, { token: 'user' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('accepts private paginated history with an unavailable campaign', async () => {
    fetch.mockResolvedValueOnce(json({ participations: [{ ...participation, campaign: null }], page: 1, pageSize: 10, total: 1 }))
    const result = await loadMyParticipation({ token: 'user' })
    expect(result.participations[0].campaign).toBeNull()
    expect(fetch.mock.calls[0][0]).toBe('/api/participations/mine?page=1&pageSize=10')
  })

  it.each(['pending', 'rejected'])('hides a non-public %s campaign summary in participation history', async status => {
    fetch.mockResolvedValueOnce(json({ participations: [{ ...participation, campaign: { id: 8, title: 'Private revised title', type: 'cause', status } }], page: 1, pageSize: 10, total: 1 }))
    expect((await loadMyParticipation({ token: 'user' })).participations[0].campaign).toBeNull()
  })

  it('rejects malformed pagination and mismatched private campaign summaries', async () => {
    fetch.mockResolvedValueOnce(json({ enquiries: [{ ...enquiry, campaign: { id: 99, title: 'Wrong campaign', status: 'approved' } }], page: 1, pageSize: 10, total: 1 }))
    await expect(loadBusinessEnquiries({ token: 'business' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    fetch.mockResolvedValueOnce(json({ participations: [], page: 1, pageSize: 10 }))
    await expect(loadMyParticipation({ token: 'user' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
