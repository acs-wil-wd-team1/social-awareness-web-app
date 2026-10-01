import { apiRequest, ApiError } from './apiClient.js'

function requireToken(token) {
  if (!token) throw new ApiError('Please log in to manage accounts.', { status: 401, code: 'AUTH_REQUIRED' })
}

function readUser(user) {
  if (!Number.isSafeInteger(user?.id) || user.id < 1
    || typeof user.name !== 'string' || !user.name.trim()
    || typeof user.email !== 'string' || !user.email.trim()
    || !['public', 'business_owner', 'admin'].includes(user.role)
    || !['active', 'suspended'].includes(user.status)
    || (user.createdAt != null && (typeof user.createdAt !== 'string' || !Number.isFinite(Date.parse(user.createdAt))))) {
    throw new ApiError('The account response could not be read. Reload the account list to check its current status.', { code: 'INVALID_RESPONSE' })
  }
  return user
}

export async function loadAdminUsers({ token, signal, page = 1, pageSize = 10, search = '', status = '' } = {}) {
  requireToken(token)
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search.trim()) query.set('search', search.trim())
  if (status) query.set('status', status)
  const result = await apiRequest(`/api/admin/users?${query}`, { token, signal, expectedStatus: 200 })
  if (!Array.isArray(result?.users) || !Number.isSafeInteger(result.page) || result.page < 1
    || !Number.isSafeInteger(result.pageSize) || result.pageSize < 1
    || !Number.isSafeInteger(result.total) || result.total < 0) {
    throw new ApiError('The account list could not be read. Please try again.', { code: 'INVALID_RESPONSE' })
  }
  return { ...result, users: result.users.map(readUser) }
}

export async function changeUserStatus(userId, status, { token, signal } = {}) {
  requireToken(token)
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1 || !/^[1-9]\d*$/.test(String(userId))
    || !['active', 'suspended'].includes(status)) {
    throw new ApiError('Choose a valid account and status.', { status: 422, code: 'VALIDATION_FAILED' })
  }
  const result = await apiRequest(`/api/admin/users/${userId}/status`, {
    method: 'PATCH', body: { status }, token, signal, expectedStatus: 200,
  })
  const user = readUser(result?.user)
  if (user.id !== Number(userId) || user.status !== status || user.role === 'admin') {
    throw new ApiError('The server did not confirm this account change. Reload the account list before trying again.', { code: 'INVALID_RESPONSE' })
  }
  return user
}
