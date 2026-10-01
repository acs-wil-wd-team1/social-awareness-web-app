import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  campaignListHasNext, deleteCampaign, loadAdminCampaign, loadAdminCampaigns, loadCampaignReviews, loadMyCampaigns, reviewCampaign, unpublishCampaign,
} from './campaignManagementService.js'

const version = '2026-10-01T05:00:00.000Z'
const nextVersion = '2026-10-01T06:00:00.000Z'
const campaign = { id: 12, title: 'Neighbourhood gardens', description: 'Plant a shared garden.', status: 'pending', updatedAt: version }
function respond(body, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })))
}

afterEach(() => vi.unstubAllGlobals())

describe('campaign management API requests', () => {
  it('uses the existing admin endpoint and includes authentication and encoded filters', async () => {
    respond({ campaigns: [campaign], page: 2, pageSize: 10 })
    const result = await loadAdminCampaigns({ token: 'admin-token', page: 2, status: 'pending', search: 'Garden & school' })
    expect(result.campaigns[0].id).toBe(12)
    const [url, options] = fetch.mock.calls[0]
    const query = new URL(url, 'https://example.test').searchParams
    expect(String(url).startsWith('/api/campaigns/admin?')).toBe(true)
    expect(query.get('page')).toBe('2')
    expect(query.get('search')).toBe('Garden & school')
    expect(query.get('status')).toBe('pending')
    expect(options.headers.Authorization).toBe('Bearer admin-token')
  })

  it('requests only the signed-in owner endpoint without sending a browser-selected owner ID', async () => {
    respond({ campaigns: [campaign], page: 1, pageSize: 10 })
    await loadMyCampaigns({ token: 'owner-token' })
    expect(fetch.mock.calls[0][0]).toBe('/api/campaigns/mine?page=1&pageSize=10')
  })

  it('rejects unauthenticated requests and invalid IDs before contacting the API', async () => {
    respond(campaign)
    await expect(loadAdminCampaign('12', {})).rejects.toMatchObject({ status: 401 })
    await expect(loadAdminCampaign('../users', { token: 'a' })).rejects.toMatchObject({ status: 404 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed list records instead of displaying a false empty or successful state', async () => {
    respond({ campaigns: [{ ...campaign, status: 'draft' }], page: 1, pageSize: 10 })
    await expect(loadMyCampaigns({ token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('rejects a details response for a different campaign', async () => {
    respond({ ...campaign, id: 13 })
    await expect(loadAdminCampaign(12, { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('sends the loaded version, decision and trimmed comments, and checks the new campaign and review', async () => {
    const result = {
      campaign: { id: 12, status: 'rejected', updatedAt: nextVersion },
      review: { id: 4, campaignId: 12, adminId: 1, action: 'rejected', comments: 'Add the location.', reviewedAt: '2026-10-01T06:00:00Z' },
    }
    respond(result)
    await expect(reviewCampaign(12, { status: 'rejected', comments: '  Add the location.  ', expectedUpdatedAt: version, adminId: 99 }, { token: 'a' })).resolves.toEqual(result)
    expect(fetch.mock.calls[0][0]).toBe('/api/campaigns/admin/12/status')
    expect(fetch.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ status: 'rejected', comments: 'Add the location.', expectedUpdatedAt: version })
  })

  it('prevents rejection without a reason and overlong comments', async () => {
    respond({})
    await expect(reviewCampaign(12, { status: 'rejected', comments: ' ', expectedUpdatedAt: version }, { token: 'a' })).rejects.toMatchObject({ status: 422 })
    await expect(reviewCampaign(12, { status: 'approved', comments: 'a'.repeat(2001), expectedUpdatedAt: version }, { token: 'a' })).rejects.toMatchObject({ status: 422 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not report success when the API omits the saved review record', async () => {
    respond({ campaign: { id: 12, status: 'approved' } })
    await expect(reviewCampaign(12, { status: 'approved', expectedUpdatedAt: version }, { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it.each([{ message: 'Approved' }, ['Approved'], 12])('rejects non-text approval comments before they can reach the screen: %j', async (comments) => {
    respond({ campaign: { id: 12, status: 'approved', updatedAt: nextVersion },
      review: { id: 4, campaignId: 12, adminId: 1, action: 'approved', comments, reviewedAt: nextVersion } })
    await expect(reviewCampaign(12, { status: 'approved', expectedUpdatedAt: version }, { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('uses only the documented status fields from a moderation response', async () => {
    const review = { id: 4, campaignId: 12, adminId: 1, action: 'approved', comments: null, reviewedAt: nextVersion }
    respond({ campaign: { id: 12, status: 'approved', updatedAt: nextVersion, title: { invalid: 'Do not render this' }, description: null }, review })
    await expect(reviewCampaign(12, { status: 'approved', expectedUpdatedAt: version }, { token: 'a' })).resolves.toEqual({
      campaign: { id: 12, status: 'approved', updatedAt: nextVersion }, review,
    })
  })

  it('uses only the documented status fields from an unpublish response', async () => {
    respond({ campaign: { id: 12, status: 'pending', updatedAt: nextVersion, title: { invalid: 'Do not render this' }, review: { comments: { invalid: true } } } })
    await expect(unpublishCampaign(12, 'Check the content.', { token: 'a', expectedUpdatedAt: version })).resolves.toEqual({
      id: 12, status: 'pending', updatedAt: nextVersion,
    })
  })

  it('preserves conflict errors for the review page to reload', async () => {
    respond({ code: 'CAMPAIGN_ALREADY_REVIEWED', message: 'Already reviewed' }, 409)
    await expect(reviewCampaign(12, { status: 'approved', expectedUpdatedAt: version }, { token: 'a' })).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_ALREADY_REVIEWED' })
  })

  it('supports pagination with and without a total count', () => {
    expect(campaignListHasNext({ campaigns: [campaign], page: 1, pageSize: 1 })).toBe(true)
    expect(campaignListHasNext({ campaigns: [campaign], page: 1, pageSize: 1, total: 1 })).toBe(false)
    expect(campaignListHasNext({ campaigns: [], page: 2, pageSize: 10 })).toBe(false)
  })

  it('loads paginated history and refuses a record belonging to another campaign', async () => {
    const review = { id: 4, campaignId: 12, adminId: 1, action: 'approved', comments: null, reviewedAt: '2026-10-01T06:00:00Z' }
    respond({ reviews: [review], page: 2, pageSize: 10, total: 11 })
    await expect(loadCampaignReviews(12, { token: 'a', page: 2 })).resolves.toMatchObject({ reviews: [review] })
    expect(fetch.mock.calls[0][0]).toBe('/api/campaigns/admin/12/reviews?page=2&pageSize=10')
    respond({ reviews: [{ ...review, campaignId: 13 }], page: 1, pageSize: 10, total: 1 })
    await expect(loadCampaignReviews(12, { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('sends a reason for unpublishing and validates the pending result', async () => {
    respond({ campaign: { id: 12, status: 'pending', updatedAt: nextVersion } })
    await expect(unpublishCampaign(12, ' Needs checking. ', { token: 'a', expectedUpdatedAt: version })).resolves.toEqual({ id: 12, status: 'pending', updatedAt: nextVersion })
    expect(fetch.mock.calls[0][0]).toBe('/api/campaigns/admin/12/publication')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ status: 'pending', reason: 'Needs checking.', expectedUpdatedAt: version })
    respond({ campaign: { id: 12, status: 'approved' } })
    await expect(unpublishCampaign(12, 'Needs checking.', { token: 'a', expectedUpdatedAt: version })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('requires a reason and a 204 deletion acknowledgement', async () => {
    respond({})
    await expect(deleteCampaign(12, '', { token: 'a', expectedUpdatedAt: version })).rejects.toMatchObject({ status: 422 })
    await expect(unpublishCampaign(12, 'a'.repeat(2001), { token: 'a', expectedUpdatedAt: version })).rejects.toMatchObject({ status: 422 })
    expect(fetch).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(deleteCampaign(12, ' Duplicate campaign. ', { token: 'a', expectedUpdatedAt: version })).resolves.toBeUndefined()
    expect(fetch.mock.calls[0][1].method).toBe('DELETE')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ reason: 'Duplicate campaign.', expectedUpdatedAt: version })
    respond({ message: 'deleted' }, 200)
    await expect(deleteCampaign(12, 'Duplicate campaign.', { token: 'a', expectedUpdatedAt: version })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it.each([undefined, '', '2026-10-01', '2026-02-30T05:00:00.000Z'])('blocks all admin writes without a canonical loaded version: %s', async (expectedUpdatedAt) => {
    respond({})
    await expect(reviewCampaign(12, { status: 'approved', expectedUpdatedAt }, { token: 'a' })).rejects.toMatchObject({ status: 422 })
    await expect(unpublishCampaign(12, 'Check content.', { token: 'a', expectedUpdatedAt })).rejects.toMatchObject({ status: 422 })
    await expect(deleteCampaign(12, 'Duplicate.', { token: 'a', expectedUpdatedAt })).rejects.toMatchObject({ status: 422 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not accept an admin detail response without a valid version', async () => {
    respond({ ...campaign, updatedAt: undefined })
    await expect(loadAdminCampaign(12, { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it.each([undefined, version, '2026-09-30T00:00:00.000Z'])('does not confirm a write without an advanced version: %s', async (updatedAt) => {
    respond({ campaign: { id: 12, status: 'pending', updatedAt } })
    await expect(unpublishCampaign(12, 'Check content.', { token: 'a', expectedUpdatedAt: version })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    respond({ campaign: { id: 12, status: 'approved', updatedAt }, review: { id: 4, campaignId: 12, adminId: 1, action: 'approved', comments: null, reviewedAt: nextVersion } })
    await expect(reviewCampaign(12, { status: 'approved', expectedUpdatedAt: version }, { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
