import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadOwnedCampaign, saveOwnedCampaign, deleteOwnedCampaign } from './ownedCampaignService.js'
import { demoRequest, demoToken } from '../demo/demoApi.js'
import { getCampaignById } from './campaignService.js'

const version = '2026-09-30T12:00:00.000Z'
const campaign = { id: 4, title: 'Community garden', description: 'Join the garden team.', categoryId: 2,
  status: 'approved', startDate: '2026-10-10', endDate: '2026-10-11', targetAudience: null,
  imageUrl: '/images/garden.png', updatedAt: version, review: { comments: 'Approved.' } }
const body = { title: campaign.title, description: campaign.description, categoryId: 2,
  targetAudience: '', startDate: campaign.startDate, endDate: campaign.endDate, expectedUpdatedAt: version }
const saved = { ...campaign, status: 'pending', updatedAt: '2026-09-30T12:01:00.000Z' }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('owned campaign API', () => {
  it('loads the exact owned route with bearer authentication', async () => {
    fetch.mockResolvedValue(json(campaign))
    expect(await loadOwnedCampaign('4', { token: 'owner-token' })).toEqual(campaign)
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/mine/4', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer owner-token' } }))
  })

  it.each(['../4', '0', '-1', '4.2', '9007199254740992', 'abc'])('rejects invalid campaign ID %s before requesting', async (id) => {
    await expect(loadOwnedCampaign(id, { token: 'owner-token' })).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '   ', 4])('requires a usable token (%s)', async (token) => {
    await expect(loadOwnedCampaign(4, { token })).rejects.toMatchObject({ status: 401 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    { id: 5 }, { id: '4' }, { title: '' }, { description: null }, { categoryId: '2' }, { categoryId: 0 },
    { status: 'deleted' }, { updatedAt: 'yesterday' }, { updatedAt: '2026-02-30T12:00:00.000Z' },
    { updatedAt: '2026-09-30' }, { targetAudience: {} }, { imageUrl: 123 }, { review: [] }, { review: { comments: {} } },
  ])('rejects a malformed owned record: %j', async (changes) => {
    fetch.mockResolvedValue(json({ ...campaign, ...changes }))
    await expect(loadOwnedCampaign(4, { token: 'owner-token' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
  })

  it('sends the full editable record and exact saved version, then announces confirmed content changes', async () => {
    fetch.mockResolvedValue(json({ campaign: saved }))
    const changed = vi.fn()
    window.addEventListener('causeconnect:content', changed)
    try {
      expect(await saveOwnedCampaign(4, { ...body, imageId: 'img_42' }, { token: 'owner-token' })).toEqual(saved)
      expect(fetch.mock.calls[0][0]).toBe('/api/campaigns/mine/4')
      expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', headers: { Authorization: 'Bearer owner-token', 'Content-Type': 'application/json' } })
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ...body, imageId: 'img_42' })
      expect(changed).toHaveBeenCalledTimes(1)
    } finally { window.removeEventListener('causeconnect:content', changed) }
  })

  it('supports an explicit image removal without a replacement image ID', async () => {
    fetch.mockResolvedValue(json({ campaign: { ...saved, imageUrl: null } }))
    await saveOwnedCampaign(4, { ...body, removeImage: true }, { token: 'owner-token' })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ...body, removeImage: true })
  })

  it.each([{ imageId: '' }, { imageId: 3 }, { removeImage: false }, { imageId: 'img_42', removeImage: true }])('rejects ambiguous or invalid photo changes: %j', async (change) => {
    await expect(saveOwnedCampaign(4, { ...body, ...change }, { token: 'owner-token' })).rejects.toMatchObject({ status: 422 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([null, '', '2026-09-30', '2026-02-30T12:00:00.000Z'])('requires an exact ISO version before either mutation: %s', async (expectedUpdatedAt) => {
    await expect(saveOwnedCampaign(4, { ...body, expectedUpdatedAt }, { token: 'owner-token' })).rejects.toMatchObject({ status: 422 })
    await expect(deleteOwnedCampaign(4, expectedUpdatedAt, { token: 'owner-token' })).rejects.toMatchObject({ status: 422 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([{}, { campaign: { ...saved, id: 9 } }, { campaign: { ...saved, status: 'approved' } },
    { campaign: { ...saved, updatedAt: version } }, { campaign: { ...saved, updatedAt: '2026-09-29T12:00:00.000Z' } },
  ])('does not claim a save for unconfirmed HTTP200: %j', async (response) => {
    fetch.mockResolvedValue(json(response))
    await expect(saveOwnedCampaign(4, body, { token: 'owner-token' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
  })

  it('rejects an empty HTTP204 save confirmation', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(saveOwnedCampaign(4, body, { token: 'owner-token' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 204 })
  })

  it('deletes with the exact version and requires an empty HTTP204 success', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }))
    const changed = vi.fn()
    window.addEventListener('causeconnect:content', changed)
    try {
      await deleteOwnedCampaign(4, version, { token: 'owner-token' })
      expect(fetch.mock.calls[0][1].method).toBe('DELETE')
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expectedUpdatedAt: version })
      expect(changed).toHaveBeenCalledTimes(1)
    } finally { window.removeEventListener('causeconnect:content', changed) }
  })

  it('rejects HTTP200 as an unconfirmed deletion and does not emit a successful-change event', async () => {
    fetch.mockResolvedValue(json({ success: true }))
    const changed = vi.fn()
    window.addEventListener('causeconnect:content', changed)
    try {
      await expect(deleteOwnedCampaign(4, version, { token: 'owner-token' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
      expect(changed).not.toHaveBeenCalled()
    } finally { window.removeEventListener('causeconnect:content', changed) }
  })

  it.each([401, 403, 404, 409, 422, 500])('preserves HTTP%s errors without automatic retry', async (status) => {
    fetch.mockResolvedValue(json({ code: 'CAMPAIGN_CHANGED', message: 'Reload first.' }, status))
    await expect(saveOwnedCampaign(4, body, { token: 'owner-token' })).rejects.toMatchObject({ status, message: 'Reload first.' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('respects an already aborted request without contacting the API', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(loadOwnedCampaign(4, { token: 'owner-token', signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('owned service with the preview provider', () => {
  it('projects edited dates and metadata after reapproval, catches a stale review version and soft-deletes', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const token = demoToken('public')
    const original = await loadOwnedCampaign(1, { token })
    const pending = await saveOwnedCampaign(1, { ...body, title: 'Updated preview garden',
      targetAudience: 'Nearby residents', startDate: '2026-11-01', endDate: '2026-11-02',
      removeImage: true, expectedUpdatedAt: original.updatedAt }, { token })
    expect(pending.status).toBe('pending')
    expect(Date.parse(pending.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt))
    await expect(getCampaignById(1)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await demoRequest('/api/campaigns/admin/1/status', { method: 'PATCH', token: demoToken('admin'), body: { status: 'approved', expectedUpdatedAt: pending.updatedAt } })
    const visible = await getCampaignById(1)
    expect(visible.campaign).toMatchObject({ id: '1', title: 'Updated preview garden', categoryId: 2,
      type: 'cause', targetAudience: 'Nearby residents', startDate: '2026-11-01', endDate: '2026-11-02',
      imageUrl: '/campaign-placeholder.svg', status: 'approved' })
    await expect(saveOwnedCampaign(1, { ...body, expectedUpdatedAt: pending.updatedAt }, { token })).rejects.toMatchObject({ status: 409 })
    const latest = await loadOwnedCampaign(1, { token })
    await deleteOwnedCampaign(1, latest.updatedAt, { token })
    await expect(loadOwnedCampaign(1, { token })).rejects.toMatchObject({ status: 404 })
    await expect(getCampaignById(1)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves the business and campaign type while rejecting a different preview owner', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const token = demoToken('business_owner')
    const original = await loadOwnedCampaign(3, { token })
    await expect(loadOwnedCampaign(3, { token: demoToken('public') })).rejects.toMatchObject({ status: 404 })
    const pending = await saveOwnedCampaign(3, { ...body, expectedUpdatedAt: original.updatedAt }, { token })
    expect(pending).toMatchObject({ type: 'business', business: original.business, createdBy: original.createdBy, status: 'pending' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
