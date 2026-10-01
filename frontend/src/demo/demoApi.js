import { ApiError } from '../services/apiClient.js'

const key = 'causeconnect.preview.v1'
export const demoUsers = {
  public: { id: 901, name: 'Alex · preview', role: 'public' },
  business_owner: { id: 902, name: 'Sam · preview', role: 'business_owner' },
  admin: { id: 903, name: 'Admin · preview', role: 'admin' },
}
export function demoToken(role) {
  const user = demoUsers[role]
  return `preview.${btoa(JSON.stringify({ id: user.id, role, exp: Math.floor(Date.now() / 1000) + 86400 }))}.sample-only`
}
const categories = [{ id: 1, name: 'Community support' }, { id: 2, name: 'Education' }, { id: 3, name: 'Environment' }, { id: 4, name: 'Health & wellbeing' }]
function initialState() {
  const seedReview = { id: 90, campaignId: 5, adminId: 903, action: 'rejected', comments: 'Please add a venue and organiser contact before resubmitting.', reviewedAt: '2026-09-30T00:00:00.000Z' }
  const seeds = [
    ['Books for Kids', "Collecting donated children's books for the local school.", 2, 'cause', 'books-for-kids.jpg', 'approved', 901],
    ['Community Food Drive', 'Help stock the shelves of our local food bank.', 1, 'cause', 'community-food-drive.jpg', 'approved', 901],
    ['Mindful Mornings', 'A welcoming wellbeing session hosted by a local business.', 4, 'business', 'mindful-mornings.jpg', 'approved', 902],
    ['Zero-Waste Week', 'Small changes for a healthier neighbourhood.', 3, 'business', 'zero-waste-week.jpg', 'pending', 902],
    ['Neighbourhood clean-up', 'A sample campaign awaiting a revised plan.', 3, 'cause', null, 'rejected', 901],
  ]
  return { nextId: 100, business: null, images: {}, participations: [], enquiries: [], reviews: [seedReview], users: Object.values(demoUsers).map(user => ({ ...user, email: `${user.role}@example.test`, status: 'active', createdAt: '2026-09-30T00:00:00.000Z' })), campaigns: seeds.map(([title, description, categoryId, type, image, status, createdBy], i) => ({
    id: i + 1, title, description, categoryId, category: categories.find(c => c.id === categoryId).name, type, status, createdBy,
    imageUrl: image ? `/images/campaigns/${image}` : null, createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z',
    ...(type === 'business' ? { business: { id: 501, businessName: 'Neighbourhood wellbeing' } } : {}),
    startDate: '2026-10-10', endDate: '2026-10-20', targetAudience: 'Local community',
    ...(status === 'rejected' ? { review: seedReview } : {}),
  })) }
}
function readState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key))
    if (!saved) return initialState()
    const initial = initialState()
    return { ...initial, ...saved, campaigns: saved.campaigns.map(c => ({ ...c, updatedAt: c.updatedAt || c.createdAt })) }
  } catch { return initialState() }
}
function save(state) {
  try { sessionStorage.setItem(key, JSON.stringify(state)) }
  catch { throw new ApiError('The sample preview is full. Reset sample data or choose a smaller photo.', { code: 'PREVIEW_STORAGE_FULL' }) }
  window.dispatchEvent(new Event('causeconnect:content'))
}
export function resetDemo() { sessionStorage.removeItem(key) }
function userFor(token, allowed) {
  const role = Object.keys(demoUsers).find(r => token === demoToken(r))
  // Demo tokens are deliberately not real authentication. Roles exist only in this build.
  let claims
  try { claims = JSON.parse(atob(token?.split('.')[1] || '')) } catch { claims = {} }
  const user = demoUsers[role || claims.role]
  if (!token?.startsWith('preview.') || !user) throw new ApiError('Please log in.', { status: 401 })
  if (readState().users.find(u => u.id === user.id)?.status === 'suspended') throw new ApiError('This account is suspended.', { status: 401 })
  if (allowed && !allowed.includes(user.role)) throw new ApiError('You do not have access to this page.', { status: 403 })
  return user
}
function pageOf(items, url, name) {
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('pageSize') ?? 10)
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError('Choose a valid page and page size.', { status: 422, code: 'VALIDATION_FAILED' })
  }
  return { [name]: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }
}
function findCampaign(state, id) {
  const campaign = state.campaigns.find(c => c.id === Number(id) && !c.deletedAt)
  if (!campaign) throw new ApiError('Campaign not found.', { status: 404, code: 'NOT_FOUND' })
  return campaign
}
function summary(campaign) { return campaign && !campaign.deletedAt ? { id: campaign.id, title: campaign.title, status: campaign.status, type: campaign.type } : null }
function publicCampaign(campaign) { const { review, ...visible } = campaign; return visible }
function contactRecord(record) { const { userId, ...visible } = record; return visible }
function changedAt(campaign) {
  campaign.updatedAt = new Date(Math.max(Date.now(), Date.parse(campaign.updatedAt || campaign.createdAt) + 1)).toISOString()
}
function requireCampaignVersion(campaign, expectedUpdatedAt) {
  if (typeof expectedUpdatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expectedUpdatedAt)
    || !Number.isFinite(Date.parse(expectedUpdatedAt)) || new Date(expectedUpdatedAt).toISOString() !== expectedUpdatedAt) {
    throw new ApiError('Reload the saved campaign before making a change.', { status: 422, code: 'VALIDATION_FAILED', fieldErrors: { expectedUpdatedAt: 'A saved campaign version is required.' } })
  }
  if (campaign.updatedAt !== expectedUpdatedAt) throw new ApiError('This campaign changed. Reload before making a decision.', { status: 409, code: 'CAMPAIGN_CHANGED' })
}
function imageData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new ApiError('This preview could not read the image.'))
    reader.readAsDataURL(file)
  })
}

export async function demoRequest(path, { method = 'GET', body, token, signal } = {}) {
  if (signal?.aborted) throw new ApiError('Request cancelled.', { code: 'ABORTED' })
  const url = new URL(path, 'https://preview.invalid')
  const route = url.pathname
  const state = readState()
  if (route === '/api/auth/login') throw new ApiError('Use the preview role selector above. Real accounts are not connected in this preview.')
  if (route === '/api/auth/register') throw new ApiError('Registration is not connected in this preview. Use the preview role selector above.')
  if (route === '/api/auth/logout') return { message: 'Preview session ended.' }
  if (route === '/api/campaigns/categories') return { categories }
  if (route === '/api/admin/users') {
    userFor(token, ['admin'])
    const search = (url.searchParams.get('search') || '').toLowerCase(), status = url.searchParams.get('status')
    return pageOf(state.users.filter(u => (!status || u.status === status) && `${u.name} ${u.email}`.toLowerCase().includes(search)), url, 'users')
  }
  const account = route.match(/^\/api\/admin\/users\/(\d+)\/status$/)
  if (account && method === 'PATCH') {
    userFor(token, ['admin'])
    const user = state.users.find(u => u.id === Number(account[1]))
    if (!user) throw new ApiError('Account not found.', { status: 404 })
    if (user.role === 'admin') throw new ApiError('The dedicated admin account cannot be changed here.', { status: 403 })
    if (!['active', 'suspended'].includes(body?.status)) throw new ApiError('Choose an account status.', { status: 422 })
    user.status = body.status; save(state); return { user }
  }
  const participation = route.match(/^\/api\/campaigns\/(\d+)\/participation$/)
  if (participation) {
    const user = userFor(token, ['public', 'business_owner']), campaignId = Number(participation[1])
    let record = state.participations.find(p => p.userId === user.id && p.campaignId === campaignId)
    if (method === 'PUT' && (!['joined', 'withdrawn'].includes(body?.status) || Object.keys(body).some(key => key !== 'status'))) {
      throw new ApiError('Choose a participation status.', { status: 422, code: 'VALIDATION_FAILED' })
    }
    // An existing participant may read or withdraw their own record without access to campaign content.
    if (!record || (method === 'PUT' && body.status === 'joined')) {
      const campaign = state.campaigns.find(c => c.id === campaignId && !c.deletedAt && c.status === 'approved')
      if (!campaign) throw new ApiError('This cause is not available for participation.', { status: 404, code: 'CAMPAIGN_NOT_FOUND' })
      if (campaign.type !== 'cause') throw new ApiError('Only social causes support participation.', { status: 409, code: 'CAMPAIGN_TYPE_MISMATCH' })
    }
    if (method === 'PUT') {
      if (!record && body.status === 'withdrawn') throw new ApiError('You have not joined this campaign.', { status: 409, code: 'PARTICIPATION_NOT_FOUND' })
      if (!record) { record = { id: state.nextId++, userId: user.id, campaignId, status: body.status, participatedAt: new Date().toISOString() }; state.participations.push(record) }
      else record.status = body.status
      save(state)
    }
    return { participation: record ? contactRecord(record) : null }
  }
  if (route === '/api/participations/mine') {
    const user = userFor(token, ['public', 'business_owner'])
    return pageOf(state.participations.filter(p => p.userId === user.id).map(p => ({ ...contactRecord(p), campaign: summary(state.campaigns.find(c => c.id === p.campaignId && c.status === 'approved')) }))
      .sort((a, b) => b.participatedAt.localeCompare(a.participatedAt) || b.id - a.id), url, 'participations')
  }
  const enquiry = route.match(/^\/api\/campaigns\/(\d+)\/enquiries$/)
  if (enquiry && method === 'POST') {
    const user = userFor(token, ['public', 'business_owner']), campaign = findCampaign(state, enquiry[1])
    if (campaign.status !== 'approved') throw new ApiError('This business campaign is not available.', { status: 404, code: 'CAMPAIGN_NOT_FOUND' })
    if (campaign.type !== 'business') throw new ApiError('Only business campaigns accept enquiries.', { status: 409, code: 'CAMPAIGN_TYPE_MISMATCH' })
    const errors = {}
    if (typeof body?.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) errors.name = 'Enter a name of up to 100 characters.'
    if (typeof body?.email !== 'string' || body.email.trim().length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) errors.email = 'Enter a valid email address.'
    if (body?.phone != null && (typeof body.phone !== 'string' || body.phone.trim().length > 20)) errors.phone = 'Use a phone number of up to 20 characters.'
    if (typeof body?.message !== 'string' || !body.message.trim() || body.message.trim().length > 2000) errors.message = 'Enter a message of up to 2,000 characters.'
    if (Object.keys(errors).length || Object.keys(body || {}).some(key => !['name', 'email', 'phone', 'message'].includes(key))) {
      throw new ApiError('Complete the enquiry fields.', { status: 422, code: 'VALIDATION_FAILED', fieldErrors: errors })
    }
    const record = { id: state.nextId++, campaignId: campaign.id, businessId: campaign.business?.id || 501, userId: user.id,
      name: body.name.trim(), email: body.email.trim().toLowerCase(), phone: body.phone?.trim() || null, message: body.message.trim(), createdAt: new Date().toISOString() }
    state.enquiries.unshift(record); save(state); return { enquiry: contactRecord(record) }
  }
  if (route === '/api/business/me/enquiries') {
    const user = userFor(token, ['business_owner'])
    if (!state.business) throw new ApiError('Create your business profile first.', { status: 409, code: 'BUSINESS_PROFILE_REQUIRED' })
    const records = state.enquiries.filter(e => e.businessId === state.business.id && state.campaigns.some(c => c.id === e.campaignId && c.createdBy === user.id))
      .map(e => ({ ...contactRecord(e), campaign: summary(state.campaigns.find(c => c.id === e.campaignId)) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    return pageOf(records, url, 'enquiries')
  }
  const owned = route.match(/^\/api\/campaigns\/mine\/(\d+)$/)
  if (owned) {
    const user = userFor(token, ['public', 'business_owner']), campaign = findCampaign(state, owned[1])
    if (campaign.createdBy !== user.id) throw new ApiError('Campaign not found.', { status: 404, code: 'NOT_FOUND' })
    if (method === 'GET') return campaign
    if (body?.expectedUpdatedAt !== campaign.updatedAt) throw new ApiError('This campaign changed. Reload before saving.', { status: 409, code: 'CAMPAIGN_CHANGED' })
    if (method === 'DELETE') { campaign.deletedAt = new Date().toISOString(); changedAt(campaign); save(state); return null }
    if (method === 'PATCH') {
      const category = categories.find(c => c.id === body.categoryId)
      if (!body.title?.trim() || !body.description?.trim() || !category) throw new ApiError('Complete the campaign details.', { status: 422 })
      for (const field of ['title', 'description', 'categoryId', 'targetAudience', 'startDate', 'endDate']) campaign[field] = body[field]
      campaign.category = category.name
      if (body.imageId) {
        if (state.images[body.imageId]?.owner !== user.id) throw new ApiError('Please upload the photo again.', { status: 422 })
        campaign.imageUrl = state.images[body.imageId].url
      } else if (body.removeImage) campaign.imageUrl = null
      campaign.status = 'pending'; delete campaign.review; changedAt(campaign); save(state); return { campaign }
    }
  }
  const history = route.match(/^\/api\/campaigns\/admin\/(\d+)\/reviews$/)
  if (history) {
    userFor(token, ['admin']); findCampaign(state, history[1])
    return pageOf(state.reviews.filter(r => r.campaignId === Number(history[1])).slice().reverse(), url, 'reviews')
  }
  const publication = route.match(/^\/api\/campaigns\/admin\/(\d+)\/publication$/)
  if (publication && method === 'PATCH') {
    userFor(token, ['admin']); const campaign = findCampaign(state, publication[1])
    requireCampaignVersion(campaign, body?.expectedUpdatedAt)
    if (campaign.status !== 'approved') throw new ApiError('This campaign is no longer approved. Reload its status.', { status: 409 })
    if (body?.status !== 'pending' || !body.reason?.trim()) throw new ApiError('Include a reason.', { status: 422 })
    campaign.status = 'pending'; delete campaign.review; changedAt(campaign); save(state)
    return { campaign: { id: campaign.id, status: campaign.status, updatedAt: campaign.updatedAt } }
  }
  const adminRemoval = route.match(/^\/api\/campaigns\/admin\/(\d+)$/)
  if (adminRemoval && method === 'DELETE') {
    userFor(token, ['admin']); const campaign = findCampaign(state, adminRemoval[1])
    requireCampaignVersion(campaign, body?.expectedUpdatedAt)
    if (!body?.reason?.trim()) throw new ApiError('Include a reason.', { status: 422 })
    campaign.deletedAt = new Date().toISOString(); changedAt(campaign); save(state); return null
  }
  if (route === '/api/business/me') {
    userFor(token, ['business_owner'])
    if (method === 'PUT') { state.business = { id: 501, ...body }; save(state) }
    return { business: state.business }
  }
  if (route === '/api/campaign-images' && method === 'POST') {
    const user = userFor(token, ['public', 'business_owner'])
    const file = body?.get('file')
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5000000) throw new ApiError('Choose a JPG, PNG or WebP image up to 5 MB.', { status: 422 })
    const imageId = `preview_image_${state.nextId++}`
    state.images[imageId] = { url: await imageData(file), owner: user.id }
    save(state)
    return { imageId, contentType: file.type, sizeBytes: file.size, expiresAt: new Date(Date.now() + 3600000).toISOString() }
  }
  if (route === '/api/campaigns' && method === 'POST') {
    const user = userFor(token, ['public', 'business_owner'])
    if (user.role === 'business_owner' && !state.business) throw new ApiError('Create your business profile first.', { status: 409, code: 'BUSINESS_PROFILE_REQUIRED' })
    if (body.imageId && state.images[body.imageId]?.owner !== user.id) throw new ApiError('Please upload the image again.', { status: 422 })
    const campaign = { ...body, id: state.nextId++, status: 'pending', createdBy: user.id, type: user.role === 'business_owner' ? 'business' : 'cause',
      category: categories.find(c => c.id === Number(body.categoryId))?.name,
      imageUrl: state.images[body.imageId]?.url || null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...(user.role === 'business_owner' ? { business: state.business } : {}),
    }
    state.campaigns.unshift(campaign); save(state)
    return { campaign: { id: campaign.id, title: campaign.title, status: campaign.status } }
  }
  const reviewMatch = route.match(/^\/api\/campaigns\/admin\/(\d+)\/status$/)
  if (reviewMatch && method === 'PATCH') {
    const user = userFor(token, ['admin'])
    const campaign = state.campaigns.find(c => c.id === Number(reviewMatch[1]) && !c.deletedAt)
    if (!campaign) throw new ApiError('Campaign not found.', { status: 404, code: 'NOT_FOUND' })
    requireCampaignVersion(campaign, body?.expectedUpdatedAt)
    if (campaign.status !== 'pending') throw new ApiError('This campaign has already been reviewed. Reload to see its status.', { status: 409, code: 'CAMPAIGN_ALREADY_REVIEWED' })
    if (!['approved', 'rejected'].includes(body.status) || (body.status === 'rejected' && !body.comments?.trim())) throw new ApiError('Add a reason for rejecting the campaign.', { status: 422 })
    campaign.status = body.status
    const review = { id: state.nextId++, campaignId: campaign.id, adminId: user.id, action: body.status, comments: body.comments || '', reviewedAt: new Date().toISOString() }
    campaign.review = review; state.reviews.push(review); changedAt(campaign); save(state)
    return { campaign: { id: campaign.id, status: campaign.status, updatedAt: campaign.updatedAt }, review }
  }
  const detail = route.match(/^\/api\/campaigns\/(admin\/)?(\d+)$/)
  if (detail) {
    if (detail[1]) userFor(token, ['admin'])
    const campaign = state.campaigns.find(c => c.id === Number(detail[2]) && !c.deletedAt && (detail[1] || c.status === 'approved'))
    if (!campaign) throw new ApiError('Campaign not found.', { status: 404, code: 'NOT_FOUND' })
    return detail[1] ? campaign : publicCampaign(campaign)
  }
  if (['/api/campaigns', '/api/campaigns/admin', '/api/campaigns/mine'].includes(route)) {
    let campaigns = state.campaigns.filter(c => !c.deletedAt)
    if (route.endsWith('/admin')) userFor(token, ['admin'])
    else if (route.endsWith('/mine')) { const user = userFor(token, ['public', 'business_owner']); campaigns = campaigns.filter(c => c.createdBy === user.id) }
    else campaigns = campaigns.filter(c => c.status === 'approved').map(publicCampaign)
    const status = url.searchParams.get('status'), search = url.searchParams.get('search'), category = url.searchParams.get('category')
    if (status) campaigns = campaigns.filter(c => c.status === status)
    if (search) campaigns = campaigns.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    if (category) campaigns = campaigns.filter(c => String(c.categoryId) === category)
    campaigns.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1), pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))
    return { campaigns: campaigns.slice((page - 1) * pageSize, page * pageSize), total: campaigns.length, page, pageSize }
  }
  throw new ApiError('This action is not included in the frontend preview.', { status: 404, code: 'NOT_FOUND' })
}
