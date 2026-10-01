import { apiRequest, ApiError } from './apiClient.js'

function path(id) {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw new ApiError('Campaign not found.', { status: 404, code: 'NOT_FOUND' })
  return `/api/campaigns/mine/${id}`
}
function options(token, signal) {
  if (typeof token !== 'string' || !token.trim()) throw new ApiError('Please log in.', { status: 401, code: 'AUTH_REQUIRED' })
  return { token, signal }
}
function validVersion(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}
function requireVersion(value) {
  if (!validVersion(value)) throw new ApiError('Reload the saved campaign before making a change.', {
    status: 422, code: 'VALIDATION_FAILED', fieldErrors: { expectedUpdatedAt: 'A saved campaign version is required.' },
  })
}
function validateCampaign(campaign, id, status = 200) {
  if (campaign?.id !== Number(id) || typeof campaign.title !== 'string' || !campaign.title.trim()
    || typeof campaign.description !== 'string' || !['pending', 'approved', 'rejected'].includes(campaign.status)
    || !Number.isSafeInteger(campaign.categoryId) || campaign.categoryId < 1
    || !validVersion(campaign.updatedAt)
    || ['startDate', 'endDate', 'targetAudience', 'imageUrl'].some(key => campaign[key] != null && typeof campaign[key] !== 'string')
    || (campaign.review != null && (typeof campaign.review !== 'object' || Array.isArray(campaign.review)
      || (campaign.review.comments != null && typeof campaign.review.comments !== 'string')))) {
    throw new ApiError('The campaign response could not be confirmed. Reload before making another change.', { code: 'INVALID_RESPONSE', status })
  }
  return campaign
}
export async function loadOwnedCampaign(id, { token, signal } = {}) {
  return validateCampaign(await apiRequest(path(id), { ...options(token, signal), expectedStatus: 200 }), id)
}
export async function saveOwnedCampaign(id, body, { token, signal } = {}) {
  requireVersion(body?.expectedUpdatedAt)
  if ((body.imageId !== undefined && (typeof body.imageId !== 'string' || !body.imageId.trim()))
    || (body.removeImage !== undefined && body.removeImage !== true)
    || (body.imageId !== undefined && body.removeImage !== undefined)) {
    throw new ApiError('Choose a replacement photo or remove the current photo, not both.', { status: 422, code: 'VALIDATION_FAILED' })
  }
  const result = await apiRequest(path(id), { ...options(token, signal), method: 'PATCH', body, expectedStatus: 200 })
  const campaign = validateCampaign(result?.campaign, id)
  if (campaign.status !== 'pending' || Date.parse(campaign.updatedAt) <= Date.parse(body.expectedUpdatedAt)) {
    throw new ApiError('The server did not confirm a new pending version. Reload before making another change.', { code: 'INVALID_RESPONSE', status: 200 })
  }
  return campaign
}
export async function deleteOwnedCampaign(id, expectedUpdatedAt, { token, signal } = {}) {
  requireVersion(expectedUpdatedAt)
  await apiRequest(path(id), { ...options(token, signal), method: 'DELETE', body: { expectedUpdatedAt }, expectedStatus: 204 })
}
