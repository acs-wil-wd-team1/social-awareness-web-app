import { apiRequest } from './apiClient.js'

export class CampaignSubmissionError extends Error {
  constructor(code, message, { status = 0, fieldErrors = {} } = {}) {
    super(message)
    this.name = 'CampaignSubmissionError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function invalidResponse(isSubmission = false) {
  return new CampaignSubmissionError('INVALID_RESPONSE', isSubmission
    ? 'The server did not confirm the saved campaign. It may have been created; please check My campaigns before submitting again.'
    : 'The category response could not be read. Please try again.')
}

export async function loadCampaignCategories({ signal } = {}) {
  const body = await apiRequest('/api/campaigns/categories', { signal, expectedStatus: 200 })
  const categories = body?.categories
  if (!Array.isArray(categories) || categories.some((category) => (
    !Number.isSafeInteger(category?.id) || category.id < 1
    || typeof category.name !== 'string' || !category.name.trim()
  )) || new Set(categories.map(({ id }) => id)).size !== categories.length) {
    throw invalidResponse()
  }
  return categories.map(({ id, name }) => ({ id, name }))
}

export async function submitCampaign(payload, { token, signal } = {}) {
  if (!token) {
    throw new CampaignSubmissionError('AUTH_REQUIRED', 'Log in before submitting a campaign.', { status: 401 })
  }
  let body
  try {
    body = await apiRequest('/api/campaigns', { method: 'POST', body: payload, token, signal, expectedStatus: 201 })
  } catch (error) {
    if (error.code === 'NETWORK_ERROR') throw new CampaignSubmissionError('NETWORK_ERROR', 'The connection was interrupted. We could not confirm whether your campaign was saved; please check My campaigns before submitting again.')
    if (error.code === 'INVALID_RESPONSE') throw invalidResponse(true)
    throw error
  }
  const campaign = body?.campaign
  if (!Number.isSafeInteger(campaign?.id) || campaign.id < 1
    || typeof campaign.title !== 'string' || !campaign.title.trim() || campaign.status !== 'pending') {
    throw invalidResponse(true)
  }
  return campaign
}

export async function uploadCampaignImage(file, { token, signal } = {}) {
  if (!token) throw new CampaignSubmissionError('AUTH_REQUIRED', 'Log in before uploading a campaign photo.', { status: 401 })
  const form = new FormData()
  form.append('file', file)
  const image = await apiRequest('/api/campaign-images', { method: 'POST', body: form, token, signal, expectedStatus: 201, timeoutMs: 60000 })
  if (typeof image?.imageId !== 'string' || !image.imageId.trim()
    || !['image/jpeg', 'image/png', 'image/webp'].includes(image.contentType)
    || !Number.isSafeInteger(image.sizeBytes) || image.sizeBytes < 1 || image.sizeBytes > 5000000
    || !image.expiresAt || !Number.isFinite(Date.parse(image.expiresAt)) || Date.parse(image.expiresAt) <= Date.now()) {
    throw new CampaignSubmissionError('INVALID_RESPONSE', 'The photo upload was not confirmed. Please try uploading the photo again.')
  }
  return image
}
