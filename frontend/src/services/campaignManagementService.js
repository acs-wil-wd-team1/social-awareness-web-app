import { apiRequest } from './apiClient.js'

export const CAMPAIGN_STATUSES = ['pending', 'approved', 'rejected']

function invalidResponse(message = 'The campaign response could not be read. Please try again.') {
  const error = new Error(message)
  error.code = 'INVALID_RESPONSE'
  return error
}

function requireToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    const error = new Error('Please log in to continue.')
    error.status = 401
    error.code = 'AUTH_REQUIRED'
    throw error
  }
}

function campaignIdPath(id) {
  const value = String(id)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    const error = new Error('This campaign could not be found.')
    error.status = 404
    error.code = 'CAMPAIGN_NOT_FOUND'
    throw error
  }
  return value
}

function validVersion(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function requireVersion(value) {
  if (!validVersion(value)) {
    const error = new Error('Reload the campaign before making a decision or changing its visibility.')
    error.status = 422
    error.code = 'VALIDATION_FAILED'
    error.fieldErrors = { expectedUpdatedAt: 'The saved campaign version is required.' }
    throw error
  }
}

function confirmedNewVersion(campaign, expectedUpdatedAt) {
  return validVersion(campaign?.updatedAt) && Date.parse(campaign.updatedAt) > Date.parse(expectedUpdatedAt)
}

function savedStatus({ id, status, updatedAt }) {
  return { id, status, updatedAt }
}

function readCampaign(campaign) {
  if (!campaign || !Number.isSafeInteger(campaign.id) || campaign.id < 1
    || typeof campaign.title !== 'string' || !campaign.title.trim()
    || typeof campaign.description !== 'string'
    || !CAMPAIGN_STATUSES.includes(campaign.status)) {
    throw invalidResponse()
  }
  for (const field of ['category', 'imageUrl', 'type', 'startDate', 'endDate', 'targetAudience', 'createdAt']) {
    if (campaign[field] != null && typeof campaign[field] !== 'string') throw invalidResponse()
  }
  if (campaign.business != null && (typeof campaign.business !== 'object'
    || typeof campaign.business.businessName !== 'string')) throw invalidResponse()
  if (campaign.review != null && (typeof campaign.review !== 'object'
    || (campaign.review.comments != null && typeof campaign.review.comments !== 'string')
    || (campaign.review.reviewedAt != null && typeof campaign.review.reviewedAt !== 'string'))) throw invalidResponse()
  return campaign
}

function readPage(body) {
  if (!body || !Array.isArray(body.campaigns)
    || !Number.isSafeInteger(body.page) || body.page < 1
    || !Number.isSafeInteger(body.pageSize) || body.pageSize < 1
    || (body.total !== undefined && (!Number.isSafeInteger(body.total) || body.total < 0))) {
    throw invalidResponse()
  }
  return { ...body, campaigns: body.campaigns.map(readCampaign) }
}

async function loadPage(path, { token, signal, page = 1, pageSize = 10, status = '', search = '' } = {}) {
  requireToken(token)
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) query.set('status', status)
  if (search.trim()) query.set('search', search.trim())
  return readPage(await apiRequest(`${path}?${query}`, { token, signal, expectedStatus: 200 }))
}

export function loadAdminCampaigns(options) {
  return loadPage('/api/campaigns/admin', options)
}

export function loadMyCampaigns(options) {
  return loadPage('/api/campaigns/mine', options)
}

export async function loadAdminCampaign(id, { token, signal } = {}) {
  requireToken(token)
  const campaignId = campaignIdPath(id)
  const campaign = await apiRequest(`/api/campaigns/admin/${campaignId}`, {
    token, signal, expectedStatus: 200,
  })
  if (campaign?.id !== Number(campaignId) || !validVersion(campaign.updatedAt)) throw invalidResponse('The campaign version could not be read. Reload before making a decision.')
  return readCampaign(campaign)
}

export async function reviewCampaign(id, { status, comments = '', expectedUpdatedAt }, { token, signal } = {}) {
  requireToken(token)
  requireVersion(expectedUpdatedAt)
  const campaignId = campaignIdPath(id)
  const reason = typeof comments === 'string' ? comments.trim() : ''
  if (!['approved', 'rejected'].includes(status) || (status === 'rejected' && !reason) || reason.length > 2000) {
    const error = new Error('Choose a decision and include a reason of up to 2,000 characters when rejecting a campaign.')
    error.status = 422
    error.code = 'VALIDATION_FAILED'
    throw error
  }
  const body = await apiRequest(`/api/campaigns/admin/${campaignId}/status`, {
    method: 'PATCH', token, signal, expectedStatus: 200,
    body: { status, expectedUpdatedAt, ...(reason ? { comments: reason } : {}) },
  })
  if (body?.campaign?.id !== Number(campaignId) || body.campaign.status !== status || !confirmedNewVersion(body.campaign, expectedUpdatedAt)
    || !Number.isSafeInteger(body?.review?.id) || body.review.id < 1
    || body.review.campaignId !== Number(campaignId) || body.review.action !== status
    || (body.review.comments != null && (typeof body.review.comments !== 'string' || body.review.comments.length > 2000))
    || (reason && body.review.comments !== reason)
    || !Number.isSafeInteger(body.review.adminId) || body.review.adminId < 1
    || typeof body.review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(body.review.reviewedAt))) {
    throw invalidResponse('We could not confirm the review result. Reload the campaign to check its current status before trying again.')
  }
  return { campaign: savedStatus(body.campaign), review: body.review }
}

export async function loadCampaignReviews(id, { token, signal, page = 1, pageSize = 10 } = {}) {
  requireToken(token)
  const campaignId = campaignIdPath(id)
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const body = await apiRequest(`/api/campaigns/admin/${campaignId}/reviews?${query}`, { token, signal, expectedStatus: 200 })
  if (!Array.isArray(body?.reviews) || !Number.isSafeInteger(body.page) || body.page < 1
    || !Number.isSafeInteger(body.pageSize) || body.pageSize < 1
    || !Number.isSafeInteger(body.total) || body.total < 0
    || body.reviews.some((review) => !Number.isSafeInteger(review?.id) || review.id < 1
      || review.campaignId !== Number(campaignId) || !Number.isSafeInteger(review.adminId) || review.adminId < 1
      || !['approved', 'rejected'].includes(review.action)
      || (review.comments != null && typeof review.comments !== 'string')
      || typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt)))) {
    throw invalidResponse('The review history could not be read. Please try again.')
  }
  return body
}

function requireReason(reason) {
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
    const error = new Error('Give a reason of between 1 and 2,000 characters.')
    error.status = 422
    error.code = 'VALIDATION_FAILED'
    error.fieldErrors = { reason: error.message }
    throw error
  }
  return reason.trim()
}

export async function unpublishCampaign(id, reason, { token, signal, expectedUpdatedAt } = {}) {
  requireToken(token)
  requireVersion(expectedUpdatedAt)
  const campaignId = campaignIdPath(id)
  const body = await apiRequest(`/api/campaigns/admin/${campaignId}/publication`, {
    method: 'PATCH', token, signal, expectedStatus: 200,
    body: { status: 'pending', reason: requireReason(reason), expectedUpdatedAt },
  })
  if (body?.campaign?.id !== Number(campaignId) || body.campaign.status !== 'pending' || !confirmedNewVersion(body.campaign, expectedUpdatedAt)) {
    throw invalidResponse('The publication change was not confirmed. Reload the campaign before trying again.')
  }
  return savedStatus(body.campaign)
}

export async function deleteCampaign(id, reason, { token, signal, expectedUpdatedAt } = {}) {
  requireToken(token)
  requireVersion(expectedUpdatedAt)
  await apiRequest(`/api/campaigns/admin/${campaignIdPath(id)}`, {
    method: 'DELETE', token, signal, expectedStatus: 204, body: { reason: requireReason(reason), expectedUpdatedAt },
  })
}

export function formatCampaignDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not provided'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value))
}

export function campaignListHasNext(result) {
  return typeof result.total === 'number'
    ? result.page * result.pageSize < result.total
    : result.campaigns.length === result.pageSize
}

export function managementErrorMessage(error) {
  if (error?.status === 401) return 'Your session has expired. Please log in again.'
  if (error?.status === 403) return 'Your account does not have access to this page.'
  if (error?.status === 404) return 'The requested campaign or page is unavailable.'
  if (error?.status === 501 || error?.status === 503) return 'This service is temporarily unavailable. Please try again later.'
  return 'We could not load your campaigns. Please try again.'
}
