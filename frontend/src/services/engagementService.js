import { ApiError, apiRequest } from './apiClient.js'

const positiveId = (value) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
const text = (value, limit) => typeof value === 'string' && Boolean(value.trim()) && value.length <= limit
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function invalidResponse() {
  return new ApiError('The server response could not be confirmed. Please check before trying again.', { code: 'INVALID_RESPONSE' })
}

function requireToken(token) {
  if (typeof token !== 'string' || !token.trim()) throw new ApiError('Please log in to continue.', { status: 401, code: 'AUTH_REQUIRED' })
}

function campaignPath(id) {
  if (!/^[1-9]\d*$/.test(String(id)) || !positiveId(Number(id))) throw new ApiError('This campaign is unavailable.', { status: 404, code: 'CAMPAIGN_NOT_FOUND' })
  return `/api/campaigns/${Number(id)}`
}

function readParticipation(value, campaignId) {
  if (!positiveId(value?.id) || !positiveId(value.campaignId) || (campaignId && value.campaignId !== Number(campaignId))
    || !['joined', 'withdrawn'].includes(value.status) || !timestamp(value.participatedAt)) throw invalidResponse()
  return value
}

function readEnquiry(value, campaignId) {
  if (!positiveId(value?.id) || !positiveId(value.campaignId) || !positiveId(value.businessId)
    || (campaignId && value.campaignId !== Number(campaignId)) || !text(value.name, 100)
    || !text(value.email, 150) || !emailPattern.test(value.email) || !text(value.message, 2000)
    || (value.phone !== null && (typeof value.phone !== 'string' || value.phone.length > 20))
    || !timestamp(value.createdAt)) throw invalidResponse()
  return value
}

function readCampaignSummary(campaign, campaignId, causeOnly) {
  if (campaign === null) return null
  if (!positiveId(campaign?.id) || campaign.id !== campaignId || !text(campaign.title, 150)
    || !['approved', 'pending', 'rejected'].includes(campaign.status) || (causeOnly && campaign.type !== 'cause')) throw invalidResponse()
  if (causeOnly && campaign.status !== 'approved') return null
  return campaign
}

function pageQuery(page, pageSize) {
  if (!positiveId(page) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError('The requested page is invalid.', { status: 422, code: 'VALIDATION_FAILED' })
  }
  return new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
}

function readPage(body, key, reader, { page, pageSize }, causeOnly = false) {
  if (!body || !Array.isArray(body[key]) || body.page !== page || body.pageSize !== pageSize
    || !Number.isSafeInteger(body.total) || body.total < 0 || body[key].length > pageSize
    || body.total < body[key].length) throw invalidResponse()
  const records = body[key].map((item) => {
    reader(item)
    return { ...item, campaign: readCampaignSummary(item.campaign, item.campaignId, causeOnly) }
  })
  if (new Set(records.map(({ id }) => id)).size !== records.length) throw invalidResponse()
  return { [key]: records, page, pageSize, total: body.total }
}

export async function loadParticipation(campaignId, { token, signal } = {}) {
  requireToken(token)
  const body = await apiRequest(`${campaignPath(campaignId)}/participation`, { token, signal, expectedStatus: 200 })
  if (body?.participation === null) return null
  return readParticipation(body?.participation, campaignId)
}

export async function setParticipation(campaignId, status, { token, signal } = {}) {
  requireToken(token)
  if (!['joined', 'withdrawn'].includes(status)) throw new ApiError('Choose a valid participation status.', { status: 422, code: 'VALIDATION_FAILED' })
  const body = await apiRequest(`${campaignPath(campaignId)}/participation`, { method: 'PUT', body: { status }, token, signal, expectedStatus: 200 })
  const participation = readParticipation(body?.participation, campaignId)
  if (participation.status !== status) throw invalidResponse()
  return participation
}

export async function loadMyParticipation({ token, signal, page = 1, pageSize = 10 } = {}) {
  requireToken(token)
  const query = pageQuery(page, pageSize)
  return readPage(await apiRequest(`/api/participations/mine?${query}`, { token, signal, expectedStatus: 200 }), 'participations', readParticipation, { page, pageSize }, true)
}

export function validateEnquiry(values) {
  const errors = {}
  if (typeof values.name !== 'string' || !values.name.trim()) errors.name = 'Name is required.'
  else if (values.name.trim().length > 100) errors.name = 'Use 100 characters or fewer.'
  if (typeof values.email !== 'string' || !values.email.trim()) errors.email = 'Email is required.'
  else if (values.email.trim().length > 150 || !emailPattern.test(values.email.trim())) errors.email = 'Enter a valid email address of no more than 150 characters.'
  if (values.phone != null && (typeof values.phone !== 'string' || values.phone.trim().length > 20)) errors.phone = 'Use 20 characters or fewer.'
  if (typeof values.message !== 'string' || !values.message.trim()) errors.message = 'Message is required.'
  else if (values.message.trim().length > 2000) errors.message = 'Use 2,000 characters or fewer.'
  return errors
}

export async function sendCampaignEnquiry(campaignId, values, { token, signal } = {}) {
  requireToken(token)
  const errors = validateEnquiry(values)
  if (Object.keys(errors).length) throw new ApiError('Please check your contact details and message.', { status: 422, code: 'VALIDATION_FAILED', fieldErrors: errors })
  const phone = values.phone?.trim() || ''
  const payload = { name: values.name.trim(), email: values.email.trim().toLowerCase(), message: values.message.trim(), ...(phone ? { phone } : {}) }
  const body = await apiRequest(`${campaignPath(campaignId)}/enquiries`, { method: 'POST', body: payload, token, signal, expectedStatus: 201 })
  const enquiry = readEnquiry(body?.enquiry, campaignId)
  if (enquiry.name !== payload.name || enquiry.email !== payload.email || enquiry.message !== payload.message || enquiry.phone !== (payload.phone || null)) throw invalidResponse()
  return enquiry
}

export async function loadBusinessEnquiries({ token, signal, page = 1, pageSize = 10 } = {}) {
  requireToken(token)
  const query = pageQuery(page, pageSize)
  return readPage(await apiRequest(`/api/business/me/enquiries?${query}`, { token, signal, expectedStatus: 200 }), 'enquiries', readEnquiry, { page, pageSize })
}

export function uncertainWrite(error) {
  return error?.code === 'NETWORK_ERROR' || error?.code === 'INVALID_RESPONSE' || error?.status >= 500
}

export function engagementErrorMessage(error) {
  if (error?.status === 401) return 'Your session has expired. Please log in again.'
  if (error?.status === 403) return 'Your account cannot access this feature.'
  if (error?.status === 404) return 'This campaign or service is unavailable.'
  return error?.message || 'The service could not be reached. Please try again.'
}

export function formatEngagementDate(value) {
  return timestamp(value) ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Not available'
}
