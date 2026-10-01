import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoRequest, demoToken, demoUsers, resetDemo } from './demoApi.js'

const publicToken = () => demoToken('public')
const businessToken = () => demoToken('business_owner')
const adminToken = () => demoToken('admin')
const details = {
  title: 'Test neighbourhood drive', description: 'Collect books for the neighbourhood library.',
  categoryId: 2, startDate: '2026-10-10', endDate: '2026-10-20', targetAudience: 'Local community',
}
const submit = (body = details, token = publicToken()) => demoRequest('/api/campaigns', { method: 'POST', body, token })
const adminDetail = (id) => demoRequest(`/api/campaigns/admin/${id}`, { token: adminToken() })
const review = async (id, body) => demoRequest(`/api/campaigns/admin/${id}/status`, {
  method: 'PATCH', token: adminToken(), body: { ...body, expectedUpdatedAt: (await adminDetail(id)).updatedAt },
})

beforeEach(() => { sessionStorage.clear(); localStorage.clear() })
afterEach(() => { sessionStorage.clear(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('sample campaign journeys', () => {
  it('moves a submitted campaign from owner pending to admin approval and public visibility', async () => {
    const { campaign } = await submit()
    expect(campaign).toMatchObject({ title: details.title, status: 'pending' })
    const own = await demoRequest('/api/campaigns/mine', { token: publicToken() })
    expect(own.campaigns).toEqual(expect.arrayContaining([expect.objectContaining({ id: campaign.id, status: 'pending', createdBy: demoUsers.public.id })]))
    const publicBefore = await demoRequest('/api/campaigns')
    expect(publicBefore.campaigns.some(item => item.id === campaign.id)).toBe(false)
    await expect(demoRequest(`/api/campaigns/${campaign.id}`)).rejects.toMatchObject({ status: 404 })
    const pending = await demoRequest('/api/campaigns/admin?status=pending', { token: adminToken() })
    expect(pending.campaigns.some(item => item.id === campaign.id)).toBe(true)
    const decision = await review(campaign.id, { status: 'approved' })
    expect(decision).toMatchObject({ campaign: { id: campaign.id, status: 'approved' }, review: { campaignId: campaign.id, action: 'approved', adminId: demoUsers.admin.id } })
    expect((await demoRequest(`/api/campaigns/${campaign.id}`)).status).toBe('approved')
    expect((await demoRequest('/api/campaigns')).campaigns.some(item => item.id === campaign.id)).toBe(true)
  })

  it('requires rejection feedback and shows it to the owner while keeping the campaign private', async () => {
    const { campaign } = await submit()
    await expect(review(campaign.id, { status: 'rejected', comments: '  ' })).rejects.toMatchObject({ status: 422 })
    expect((await demoRequest(`/api/campaigns/admin/${campaign.id}`, { token: adminToken() })).status).toBe('pending')
    await review(campaign.id, { status: 'rejected', comments: 'Please include a venue.' })
    const own = await demoRequest('/api/campaigns/mine?status=rejected', { token: publicToken() })
    expect(own.campaigns).toEqual(expect.arrayContaining([expect.objectContaining({ id: campaign.id, status: 'rejected', review: expect.objectContaining({ comments: 'Please include a venue.' }) })]))
    await expect(demoRequest(`/api/campaigns/${campaign.id}`)).rejects.toMatchObject({ status: 404 })
  })

  it('prevents a second review from overwriting a completed decision', async () => {
    const { campaign } = await submit()
    await review(campaign.id, { status: 'approved' })
    await expect(review(campaign.id, { status: 'rejected', comments: 'Changed my mind.' })).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_ALREADY_REVIEWED' })
    expect((await demoRequest(`/api/campaigns/${campaign.id}`)).status).toBe('approved')
  })

  it('requires a business profile, then creates a pending business campaign', async () => {
    await expect(submit(details, businessToken())).rejects.toMatchObject({ status: 409, code: 'BUSINESS_PROFILE_REQUIRED' })
    await demoRequest('/api/business/me', { method: 'PUT', token: businessToken(), body: { businessName: 'Sample bookshop', abn: '', website: 'https://example.test', description: 'A local bookshop.' } })
    const { campaign } = await submit({ ...details, type: 'cause', status: 'approved', createdBy: 1 }, businessToken())
    const stored = await demoRequest(`/api/campaigns/admin/${campaign.id}`, { token: adminToken() })
    expect(stored).toMatchObject({ type: 'business', status: 'pending', createdBy: demoUsers.business_owner.id, business: { businessName: 'Sample bookshop' } })
  })

  it('keeps owner lists separate for the two sample authors', async () => {
    const publicList = await demoRequest('/api/campaigns/mine', { token: publicToken() })
    const businessList = await demoRequest('/api/campaigns/mine', { token: businessToken() })
    expect(publicList.campaigns.length).toBeGreaterThan(0)
    expect(businessList.campaigns.length).toBeGreaterThan(0)
    expect(publicList.campaigns.every(item => item.createdBy === demoUsers.public.id)).toBe(true)
    expect(businessList.campaigns.every(item => item.createdBy === demoUsers.business_owner.id)).toBe(true)
    expect(publicList.campaigns.some(item => businessList.campaigns.some(other => other.id === item.id))).toBe(false)
  })

  it.each([
    ['/api/campaigns/mine', undefined, 401],
    ['/api/campaigns/admin', 'public', 403],
    ['/api/campaigns/admin/4', 'business_owner', 403],
    ['/api/business/me', 'public', 403],
    ['/api/campaigns/mine', 'admin', 403],
  ])('applies sample role checks to %s for %s', async (path, role, status) => {
    await expect(demoRequest(path, { token: role ? demoToken(role) : undefined })).rejects.toMatchObject({ status })
  })

  it('keeps pending and rejected campaigns hidden even if a public caller asks for them', async () => {
    expect((await demoRequest('/api/campaigns?status=pending')).campaigns).toEqual([])
    expect((await demoRequest('/api/campaigns?status=rejected')).campaigns).toEqual([])
    expect((await demoRequest('/api/campaigns?pageSize=100')).campaigns.every(item => item.status === 'approved')).toBe(true)
  })

  it('returns correct pagination totals and an empty page beyond the end', async () => {
    const first = await demoRequest('/api/campaigns/admin?page=1&pageSize=2', { token: adminToken() })
    const second = await demoRequest('/api/campaigns/admin?page=2&pageSize=2', { token: adminToken() })
    expect(first).toMatchObject({ total: 5, page: 1, pageSize: 2 })
    expect(first.campaigns).toHaveLength(2)
    expect(second.campaigns).toHaveLength(2)
    expect(first.campaigns.some(item => second.campaigns.some(other => other.id === item.id))).toBe(false)
    expect((await demoRequest('/api/campaigns/admin?page=99&pageSize=2', { token: adminToken() })).campaigns).toEqual([])
  })

  it('associates an image with its sample owner and prevents the other owner from using it', async () => {
    const body = new FormData()
    body.append('file', new File(['image data'], 'cover.png', { type: 'image/png' }))
    const uploaded = await demoRequest('/api/campaign-images', { method: 'POST', body, token: publicToken() })
    await demoRequest('/api/business/me', { method: 'PUT', token: businessToken(), body: { businessName: 'Sample shop' } })
    await expect(submit({ ...details, imageId: uploaded.imageId }, businessToken())).rejects.toMatchObject({ status: 422 })
    const { campaign } = await submit({ ...details, imageId: uploaded.imageId })
    const stored = await demoRequest(`/api/campaigns/admin/${campaign.id}`, { token: adminToken() })
    expect(stored.imageUrl).toMatch(/^data:image\/png;base64,/)
    await expect(demoRequest(`/api/campaigns/${campaign.id}`)).rejects.toMatchObject({ status: 404 })
  })

  it('does not call a network service or save real login details in preview mode', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(demoRequest('/api/auth/login', { method: 'POST', body: { email: 'private@example.test', password: 'not-a-real-password' } })).rejects.toThrow('preview role selector')
    await expect(demoRequest('/api/auth/register', { method: 'POST', body: { email: 'private@example.test' } })).rejects.toThrow('not connected')
    expect(fetch).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it('reset restores the sample state', async () => {
    const { campaign } = await submit()
    resetDemo()
    await expect(demoRequest(`/api/campaigns/admin/${campaign.id}`, { token: adminToken() })).rejects.toMatchObject({ status: 404 })
    expect((await demoRequest('/api/campaigns/admin', { token: adminToken() })).total).toBe(5)
  })

  it('does not save when the caller already cancelled the request', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(demoRequest('/api/campaigns', { method: 'POST', body: details, token: publicToken(), signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' })
    expect((await demoRequest('/api/campaigns/admin', { token: adminToken() })).total).toBe(5)
  })
})

const enquiryDetails = { name: ' Alex Example ', email: ' ALEX@Example.test ', phone: ' 0400000000 ', message: ' Please tell me more. ' }
const join = (id, status = 'joined', token = publicToken()) => demoRequest(`/api/campaigns/${id}/participation`, { method: 'PUT', token, body: { status } })
const sendEnquiry = (id = 3, body = enquiryDetails, token = publicToken()) => demoRequest(`/api/campaigns/${id}/enquiries`, { method: 'POST', body, token })
const saveBusiness = () => demoRequest('/api/business/me', { method: 'PUT', token: businessToken(), body: { businessName: 'Sample business' } })
const ownerDetail = (id, token = publicToken()) => demoRequest(`/api/campaigns/mine/${id}`, { token })
const edit = (id, expectedUpdatedAt, body = {}, token = publicToken()) => demoRequest(`/api/campaigns/mine/${id}`, {
  method: 'PATCH', token, body: { ...details, ...body, expectedUpdatedAt },
})
const unpublish = async (id, reason = 'Campaign details need another review.') => demoRequest(`/api/campaigns/admin/${id}/publication`, {
  method: 'PATCH', token: adminToken(), body: { status: 'pending', reason, expectedUpdatedAt: (await adminDetail(id)).updatedAt },
})

describe('sample participation and enquiries', () => {
  it('joins, withdraws and rejoins idempotently while retaining the first join time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'))
    expect(await demoRequest('/api/campaigns/1/participation', { token: publicToken() })).toEqual({ participation: null })
    const { participation } = await join(1)
    expect(participation).toMatchObject({ campaignId: 1, status: 'joined', participatedAt: '2026-10-01T00:00:00.000Z' })
    expect(participation).not.toHaveProperty('userId')
    expect((await join(1)).participation).toEqual(participation)
    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'))
    expect((await join(1, 'withdrawn')).participation).toEqual({ ...participation, status: 'withdrawn' })
    expect((await join(1, 'withdrawn')).participation).toEqual({ ...participation, status: 'withdrawn' })
    vi.setSystemTime(new Date('2026-10-03T00:00:00.000Z'))
    expect((await join(1)).participation).toEqual(participation)
    const history = await demoRequest('/api/participations/mine?page=1&pageSize=10', { token: publicToken() })
    expect(history).toMatchObject({ total: 1, page: 1, pageSize: 10 })
    expect(history.participations[0]).toMatchObject({ ...participation, campaign: { id: 1, type: 'cause', status: 'approved' } })
  })

  it('rejects withdrawal before joining, wrong campaign types, private campaigns and ownership overrides', async () => {
    await expect(join(1, 'withdrawn')).rejects.toMatchObject({ status: 409, code: 'PARTICIPATION_NOT_FOUND' })
    await expect(join(3)).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_TYPE_MISMATCH' })
    await expect(join(5)).rejects.toMatchObject({ status: 404 })
    await expect(demoRequest('/api/campaigns/1/participation', { method: 'PUT', token: publicToken(), body: { status: 'joined', userId: 902 } })).rejects.toMatchObject({ status: 422 })
    expect((await demoRequest('/api/participations/mine', { token: publicToken() })).total).toBe(0)
  })

  it('keeps participation history private across sample roles and pages', async () => {
    await join(1)
    await join(2)
    await join(1, 'joined', businessToken())
    const publicFirst = await demoRequest('/api/participations/mine?page=1&pageSize=1', { token: publicToken() })
    const publicSecond = await demoRequest('/api/participations/mine?page=2&pageSize=1', { token: publicToken() })
    const business = await demoRequest('/api/participations/mine?userId=901', { token: businessToken() })
    expect(publicFirst.total).toBe(2)
    expect(publicSecond.total).toBe(2)
    expect(publicFirst.participations[0].id).not.toBe(publicSecond.participations[0].id)
    expect(business.total).toBe(1)
    expect(business.participations[0].id).not.toBe(publicFirst.participations[0].id)
    expect((await demoRequest('/api/participations/mine?page=9&pageSize=1', { token: publicToken() })).participations).toEqual([])
    await expect(demoRequest('/api/participations/mine?page=-1', { token: publicToken() })).rejects.toMatchObject({ status: 422 })
  })

  it('saves normalised enquiry details privately for the business and supports blank phone', async () => {
    const { enquiry } = await sendEnquiry()
    expect(enquiry).toMatchObject({ campaignId: 3, businessId: 501, name: 'Alex Example', email: 'alex@example.test', phone: '0400000000', message: 'Please tell me more.' })
    expect(enquiry).not.toHaveProperty('userId')
    await expect(demoRequest('/api/business/me/enquiries', { token: businessToken() })).rejects.toMatchObject({ status: 409, code: 'BUSINESS_PROFILE_REQUIRED' })
    await saveBusiness()
    const inbox = await demoRequest('/api/business/me/enquiries?page=1&pageSize=10', { token: businessToken() })
    expect(inbox).toMatchObject({ total: 1, enquiries: [expect.objectContaining({ ...enquiry, campaign: { id: 3, title: 'Mindful Mornings', status: 'approved', type: 'business' } })] })
    const second = await sendEnquiry(3, { ...enquiryDetails, phone: '' })
    expect(second.enquiry.phone).toBeNull()
    const publicCampaign = await demoRequest('/api/campaigns/3')
    expect(JSON.stringify(publicCampaign)).not.toContain('alex@example.test')
    expect(JSON.stringify(publicCampaign)).not.toContain('Please tell me more.')
    expect((await demoRequest('/api/business/me/enquiries?page=1&pageSize=1', { token: businessToken() })).total).toBe(2)
    expect((await demoRequest('/api/business/me/enquiries?page=9&pageSize=1', { token: businessToken() })).enquiries).toEqual([])
  })

  it.each([
    [{ name: '' }, 'name'],
    [{ email: 'alex@' }, 'email'],
    [{ phone: '1'.repeat(21) }, 'phone'],
    [{ message: 'x'.repeat(2001) }, 'message'],
    [{ name: 123 }, 'name'],
  ])('validates enquiry fields without saving invalid input', async (patch, field) => {
    await expect(sendEnquiry(3, { ...enquiryDetails, ...patch })).rejects.toMatchObject({ status: 422, fieldErrors: { [field]: expect.any(String) } })
    await saveBusiness()
    expect((await demoRequest('/api/business/me/enquiries', { token: businessToken() })).total).toBe(0)
  })

  it('prevents enquiries to pending/cause campaigns and rejects a forged recipient business', async () => {
    await expect(sendEnquiry(4)).rejects.toMatchObject({ status: 404 })
    await expect(sendEnquiry(1)).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_TYPE_MISMATCH' })
    await expect(sendEnquiry(3, { ...enquiryDetails, businessId: 999 })).rejects.toMatchObject({ status: 422 })
  })

  it.each([
    ['/api/campaigns/1/participation', undefined, 'GET', 401],
    ['/api/campaigns/1/participation', 'admin', 'PUT', 403],
    ['/api/participations/mine', 'admin', 'GET', 403],
    ['/api/campaigns/3/enquiries', undefined, 'POST', 401],
    ['/api/campaigns/3/enquiries', 'admin', 'POST', 403],
    ['/api/business/me/enquiries', 'public', 'GET', 403],
    ['/api/business/me/enquiries', 'admin', 'GET', 403],
  ])('protects %s from the %s sample role', async (path, role, method, status) => {
    await expect(demoRequest(path, { method, token: role ? demoToken(role) : undefined, body: enquiryDetails })).rejects.toMatchObject({ status })
  })
})

describe('sample editing and moderation journeys', () => {
  it('requires a current owner version and sends an approved edit back for review', async () => {
    const previous = await ownerDetail(1)
    const result = await edit(1, previous.updatedAt, { title: 'Updated books drive' })
    expect(result.campaign).toMatchObject({ id: 1, title: 'Updated books drive', status: 'pending' })
    expect(result.campaign.updatedAt).not.toBe(previous.updatedAt)
    await expect(demoRequest('/api/campaigns/1')).rejects.toMatchObject({ status: 404 })
    await expect(edit(1, previous.updatedAt, { title: 'Stale overwrite' })).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_CHANGED' })
    expect((await ownerDetail(1)).title).toBe('Updated books drive')
    await review(1, { status: 'approved' })
    expect((await demoRequest('/api/campaigns/1')).title).toBe('Updated books drive')
    expect(await demoRequest('/api/campaigns/1')).not.toHaveProperty('review')
    expect((await demoRequest('/api/campaigns')).campaigns.find(c => c.id === 1)).not.toHaveProperty('review')
  })

  it('retains seeded and subsequent review decisions through editing, reapproval and unpublishing', async () => {
    const seeded = await demoRequest('/api/campaigns/admin/5/reviews', { token: adminToken() })
    expect(seeded.reviews).toEqual([expect.objectContaining({ id: 90, campaignId: 5, adminId: demoUsers.admin.id, action: 'rejected', reviewedAt: expect.any(String) })])
    await edit(5, (await ownerDetail(5)).updatedAt)
    expect((await ownerDetail(5)).review).toBeUndefined()
    const approved = await review(5, { status: 'approved', comments: 'Revised details are ready.' })
    await unpublish(5)
    await expect(demoRequest('/api/campaigns/5')).rejects.toMatchObject({ status: 404 })
    await expect(unpublish(5)).rejects.toMatchObject({ status: 409 })
    const history = await demoRequest('/api/campaigns/admin/5/reviews?page=1&pageSize=10', { token: adminToken() })
    expect(history.total).toBe(2)
    expect(history.reviews.map(item => item.action)).toEqual(['approved', 'rejected'])
    expect(history.reviews[0].id).toBe(approved.review.id)
    await review(5, { status: 'approved' })
    expect((await demoRequest('/api/campaigns/admin/5/reviews', { token: adminToken() })).total).toBe(3)
  })

  it('retains participation history after an owner soft-deletes a cause', async () => {
    const joined = await join(1)
    const campaign = await ownerDetail(1)
    await expect(demoRequest('/api/campaigns/mine/1', { method: 'DELETE', token: publicToken(), body: { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' } })).rejects.toMatchObject({ status: 409 })
    expect(await demoRequest('/api/campaigns/mine/1', { method: 'DELETE', token: publicToken(), body: { expectedUpdatedAt: campaign.updatedAt } })).toBeNull()
    await expect(demoRequest('/api/campaigns/1')).rejects.toMatchObject({ status: 404 })
    await expect(ownerDetail(1)).rejects.toMatchObject({ status: 404 })
    expect((await demoRequest('/api/campaigns/admin', { token: adminToken() })).campaigns.some(c => c.id === 1)).toBe(false)
    expect((await demoRequest('/api/participations/mine', { token: publicToken() })).participations).toEqual([{ ...joined.participation, campaign: null }])
  })

  it('retains private enquiry history after an admin removes a business campaign', async () => {
    await saveBusiness()
    const { enquiry } = await sendEnquiry()
    const expectedUpdatedAt = (await adminDetail(3)).updatedAt
    await expect(demoRequest('/api/campaigns/admin/3', { method: 'DELETE', token: adminToken(), body: { reason: ' ', expectedUpdatedAt } })).rejects.toMatchObject({ status: 422 })
    expect(await demoRequest('/api/campaigns/admin/3', { method: 'DELETE', token: adminToken(), body: { reason: 'Campaign withdrawn by the organiser.', expectedUpdatedAt } })).toBeNull()
    await expect(demoRequest('/api/campaigns/3')).rejects.toMatchObject({ status: 404 })
    expect((await demoRequest('/api/business/me/enquiries', { token: businessToken() })).enquiries).toEqual([{ ...enquiry, campaign: null }])
  })

  it('restricts owner edits and administrator actions by role and campaign ownership', async () => {
    const campaign = await ownerDetail(1)
    await expect(ownerDetail(1, businessToken())).rejects.toMatchObject({ status: 404 })
    await expect(edit(1, campaign.updatedAt, {}, businessToken())).rejects.toMatchObject({ status: 404 })
    await expect(ownerDetail(1, adminToken())).rejects.toMatchObject({ status: 403 })
    await expect(demoRequest('/api/campaigns/admin/1/publication', { method: 'PATCH', token: publicToken(), body: { status: 'pending', reason: 'Test' } })).rejects.toMatchObject({ status: 403 })
    await expect(demoRequest('/api/campaigns/admin/1/reviews', { token: businessToken() })).rejects.toMatchObject({ status: 403 })
    await expect(demoRequest('/api/campaigns/admin/1', { method: 'DELETE', token: publicToken(), body: { reason: 'Test' } })).rejects.toMatchObject({ status: 403 })
    expect((await demoRequest('/api/campaigns/1')).status).toBe('approved')
  })

  it('suspends existing sample sessions, allows restoration and protects the dedicated administrator', async () => {
    const token = publicToken()
    const updateStatus = (id, status, requestToken = adminToken()) => demoRequest(`/api/admin/users/${id}/status`, { method: 'PATCH', token: requestToken, body: { status } })
    await expect(demoRequest('/api/admin/users', { token })).rejects.toMatchObject({ status: 403 })
    await expect(updateStatus(demoUsers.public.id, 'suspended', businessToken())).rejects.toMatchObject({ status: 403 })
    await expect(updateStatus(demoUsers.admin.id, 'suspended')).rejects.toMatchObject({ status: 403 })
    await expect(updateStatus(demoUsers.public.id, 'admin')).rejects.toMatchObject({ status: 422 })
    await updateStatus(demoUsers.public.id, 'suspended')
    await expect(demoRequest('/api/campaigns/mine', { token })).rejects.toMatchObject({ status: 401 })
    await expect(join(1, 'joined', token)).rejects.toMatchObject({ status: 401 })
    await expect(sendEnquiry(3, enquiryDetails, token)).rejects.toMatchObject({ status: 401 })
    const suspended = await demoRequest('/api/admin/users?status=suspended&search=alex', { token: adminToken() })
    expect(suspended.users).toEqual([expect.objectContaining({ id: demoUsers.public.id, status: 'suspended' })])
    await updateStatus(demoUsers.public.id, 'active')
    expect((await demoRequest('/api/campaigns/mine', { token })).total).toBeGreaterThan(0)
  })

  it('rejects an approval for the old content when an author edits a pending campaign first', async () => {
    const { campaign } = await submit()
    const reviewedVersion = (await adminDetail(campaign.id)).updatedAt
    await edit(campaign.id, reviewedVersion, { title: 'Different content not seen by admin' })
    await expect(demoRequest(`/api/campaigns/admin/${campaign.id}/status`, { method: 'PATCH', token: adminToken(), body: { status: 'approved', expectedUpdatedAt: reviewedVersion } }))
      .rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_CHANGED' })
    expect(await adminDetail(campaign.id)).toMatchObject({ title: 'Different content not seen by admin', status: 'pending' })
    expect((await demoRequest(`/api/campaigns/admin/${campaign.id}/reviews`, { token: adminToken() })).reviews).toEqual([])
    const latest = await adminDetail(campaign.id)
    const confirmed = await review(campaign.id, { status: 'approved' })
    expect(Date.parse(confirmed.campaign.updatedAt)).toBeGreaterThan(Date.parse(latest.updatedAt))
  })

  it.each([
    ['status', 'PATCH', { status: 'approved' }],
    ['publication', 'PATCH', { status: 'pending', reason: 'Check the latest changes.' }],
    ['', 'DELETE', { reason: 'Remove this campaign.' }],
  ])('rejects an outdated version on admin %s without changing the latest campaign', async (suffix, method, body) => {
    const original = await adminDetail(1)
    await edit(1, original.updatedAt, { title: 'Latest owner changes' })
    const path = `/api/campaigns/admin/1${suffix ? `/${suffix}` : ''}`
    await expect(demoRequest(path, { method, token: adminToken(), body: { ...body, expectedUpdatedAt: original.updatedAt } }))
      .rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_CHANGED' })
    expect(await adminDetail(1)).toMatchObject({ title: 'Latest owner changes', status: 'pending' })
  })

  it.each([
    ['status', 'PATCH', { status: 'approved' }],
    ['publication', 'PATCH', { status: 'pending', reason: 'Check the details.' }],
    ['', 'DELETE', { reason: 'Remove this campaign.' }],
  ])('requires a canonical saved version for admin %s', async (suffix, method, body) => {
    const path = `/api/campaigns/admin/1${suffix ? `/${suffix}` : ''}`
    for (const expectedUpdatedAt of [undefined, '', '2026-09-30', '2026-02-30T12:00:00.000Z', '2026-09-30T00:00:00Z']) {
      await expect(demoRequest(path, { method, token: adminToken(), body: { ...body, expectedUpdatedAt } }))
        .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED', fieldErrors: { expectedUpdatedAt: expect.any(String) } })
    }
    expect((await adminDetail(1)).status).toBe('approved')
  })

  it('returns the advanced version after unpublishing for the next admin action', async () => {
    const original = await adminDetail(1)
    const response = await unpublish(1)
    expect(response.campaign.status).toBe('pending')
    expect(Date.parse(response.campaign.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt))
    const confirmed = await demoRequest('/api/campaigns/admin/1/status', { method: 'PATCH', token: adminToken(), body: { status: 'approved', expectedUpdatedAt: response.campaign.updatedAt } })
    expect(confirmed.campaign.status).toBe('approved')
    expect(Date.parse(confirmed.campaign.updatedAt)).toBeGreaterThan(Date.parse(response.campaign.updatedAt))
  })
})
