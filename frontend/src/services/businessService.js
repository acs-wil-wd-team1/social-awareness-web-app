import { apiRequest, ApiError } from './apiClient.js'

function readBusiness(body, allowEmpty = false) {
  const business = body?.business
  if (allowEmpty && business === null) return null
  if (!Number.isSafeInteger(business?.id) || business.id < 1 || typeof business.businessName !== 'string' || !business.businessName.trim()
    || ['abn', 'website', 'description'].some((field) => business[field] != null && typeof business[field] !== 'string')) {
    throw new ApiError('The business profile response could not be read. Please reload your profile.', { code: 'INVALID_RESPONSE' })
  }
  return business
}

export async function loadBusinessProfile({ token, signal } = {}) {
  return readBusiness(await apiRequest('/api/business/me', { token, signal, expectedStatus: 200 }), true)
}

export async function saveBusinessProfile(values, { token, signal } = {}) {
  const body = Object.fromEntries(['businessName', 'abn', 'website', 'description'].map((field) => [field, values[field].trim()]))
  try {
    return readBusiness(await apiRequest('/api/business/me', { method: 'PUT', body, token, signal, expectedStatus: 200 }))
  } catch (error) {
    if (error.code === 'NETWORK_ERROR') throw new ApiError('We could not confirm whether your business profile was saved. Reload the profile to check before saving again.', { code: 'NETWORK_ERROR' })
    throw error
  }
}

export function validateBusinessProfile(values) {
  const errors = {}
  if (!values.businessName.trim()) errors.businessName = 'Business name is required.'
  else if (values.businessName.trim().length > 150) errors.businessName = 'Use 150 characters or fewer.'
  if (values.abn.trim().length > 20) errors.abn = 'Use 20 characters or fewer.'
  if (values.description.trim().length > 2000) errors.description = 'Use 2,000 characters or fewer.'
  if (values.website.trim()) {
    try {
      const url = new URL(values.website.trim())
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Invalid website')
      if (values.website.trim().length > 255) errors.website = 'Use 255 characters or fewer.'
    } catch {
      errors.website = 'Enter a full website address starting with https:// or http://.'
    }
  }
  return errors
}
