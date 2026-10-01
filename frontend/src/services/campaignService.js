import { apiRequest } from './apiClient.js'

export class CampaignRequestError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CampaignRequestError'
    this.code = code
  }
}

function invalidResponse() {
  return new CampaignRequestError('INVALID_RESPONSE', 'The campaign response could not be read. Please try again.')
}

function validId(value) {
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))
}

function normalizeCampaign(campaign) {
  if (!campaign || !validId(campaign.id)
    || typeof campaign.title !== 'string' || !campaign.title.trim()
    || typeof campaign.description !== 'string') throw invalidResponse()
  for (const field of ['imageUrl', 'category', 'startDate', 'endDate', 'targetAudience', 'createdAt', 'details']) {
    if (campaign[field] != null && typeof campaign[field] !== 'string') throw invalidResponse()
  }
  if (campaign.business != null && (typeof campaign.business !== 'object'
    || typeof campaign.business.businessName !== 'string')) throw invalidResponse()
  if (campaign.goals != null && (!Array.isArray(campaign.goals)
    || campaign.goals.some((goal) => typeof goal !== 'string'))) throw invalidResponse()
  return {
    ...campaign,
    id: String(campaign.id),
    category: campaign.category?.trim() || 'Uncategorised',
    imageUrl: campaign.imageUrl?.trim() || '/campaign-placeholder.svg',
    type: ['business', 'cause'].includes(campaign.type) ? campaign.type : null,
  }
}

export function selectPublicCampaigns(campaigns) {
  if (!Array.isArray(campaigns) || campaigns.some((campaign) => !campaign
    || !['approved', 'pending', 'rejected'].includes(campaign.status))) throw invalidResponse()
  // The API supplies the ordered page. Preserve that order, including numeric-ID ties.
  return campaigns.filter(({ status }) => status === 'approved').map(normalizeCampaign)
}

export async function listCampaigns({ signal, page = 1, pageSize = 20, search = '', category = '' } = {}) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search.trim()) query.set('search', search.trim())
  if (category) query.set('category', String(category))
  const body = await apiRequest(`/api/campaigns?${query}`, { signal, expectedStatus: 200 })
  if (!body || !Array.isArray(body.campaigns)
    || !Number.isSafeInteger(body.page) || body.page < 1
    || !Number.isSafeInteger(body.pageSize) || body.pageSize < 1
    || (body.total !== undefined && (!Number.isSafeInteger(body.total) || body.total < 0))) throw invalidResponse()
  return {
    items: selectPublicCampaigns(body.campaigns),
    page: body.page,
    pageSize: body.pageSize,
    ...(body.total !== undefined ? { total: body.total } : {}),
    hasNext: body.total !== undefined
      ? body.page * body.pageSize < body.total
      : body.campaigns.length === body.pageSize,
  }
}

export async function loadPublicCategories({ signal } = {}) {
  const body = await apiRequest('/api/campaigns/categories', { signal, expectedStatus: 200 })
  if (!Array.isArray(body?.categories) || body.categories.some((category) => (
    !Number.isSafeInteger(category?.id) || category.id < 1
    || typeof category.name !== 'string' || !category.name.trim()
  ))) throw invalidResponse()
  return body.categories
}

export async function getCampaignById(id, { signal } = {}) {
  if (!validId(id)) throw new CampaignRequestError('NOT_FOUND', 'The campaign could not be found.')
  let body
  try {
    body = await apiRequest(`/api/campaigns/${id}`, { signal, expectedStatus: 200 })
  } catch (error) {
    if (error?.status === 404) throw new CampaignRequestError('NOT_FOUND', 'The campaign could not be found.')
    throw error
  }
  const campaign = body?.campaign ?? body
  if (campaign && ['pending', 'rejected'].includes(campaign.status)) {
    throw new CampaignRequestError('NOT_FOUND', 'The campaign could not be found.')
  }
  if (!campaign || campaign.status !== 'approved') throw invalidResponse()
  if (String(campaign.id) !== String(id)) throw invalidResponse()
  return { campaign: normalizeCampaign(campaign) }
}
