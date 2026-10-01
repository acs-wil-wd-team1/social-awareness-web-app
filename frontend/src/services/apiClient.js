export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', fieldErrors = {} } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export function apiUrl(path, base = import.meta.env.VITE_API_BASE_URL || '/api') {
  const prefix = base.replace(/\/+$/, '')
  if (!/^https?:\/\//.test(prefix) && prefix !== '/api') {
    throw new ApiError('The API address is not configured correctly.', { code: 'CONFIG_ERROR' })
  }
  if (prefix !== '/api') {
    let url
    try { url = new URL(prefix) } catch {
      throw new ApiError('The API address is not configured correctly.', { code: 'CONFIG_ERROR' })
    }
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new ApiError('Use an HTTPS API address without credentials or query parameters.', { code: 'CONFIG_ERROR' })
    }
  }
  return `${prefix}/${path.replace(/^\/api(?=\/|$)/, '').replace(/^\/+/, '')}`
}

export async function apiRequest(path, { method = 'GET', body, token, signal, headers = {}, expectedStatus, timeoutMs = 15000 } = {}) {
  if (signal?.aborted) throw new ApiError('Request cancelled.', { code: 'ABORTED' })
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { demoRequest } = await import('../demo/demoApi.js')
    try { return await demoRequest(path, { method, body, token, signal }) }
    catch (error) {
      if (error.status === 401 && token) window.dispatchEvent(new CustomEvent('causeconnect:unauthorized', { detail: { token } }))
      throw error
    }
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData
    const response = await fetch(apiUrl(path), {
      method,
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
      signal: controller.signal,
    })
    const data = response.status === 204 ? null : await response.json().catch((error) => {
      // Reading the body is part of fetch: cancellation must not look like bad JSON.
      if (controller.signal.aborted) throw error
      return null
    })
    if (!response.ok) {
      if (response.status === 401 && token) {
        window.dispatchEvent(new CustomEvent('causeconnect:unauthorized', { detail: { token } }))
      }
      throw new ApiError((typeof data?.message === 'string' && data.message) || (response.status === 503 ? 'The API is not available yet. Please try again later.' : 'The request could not be completed.'), {
        status: response.status,
        code: typeof data?.code === 'string' && data.code.trim() ? data.code : (response.status === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED'),
        fieldErrors: data?.fieldErrors && typeof data.fieldErrors === 'object' && !Array.isArray(data.fieldErrors)
          ? Object.fromEntries(Object.entries(data.fieldErrors).filter(([, value]) => typeof value === 'string')) : {},
      })
    }
    if ((expectedStatus && response.status !== expectedStatus) || (response.status !== 204 && (data === null || typeof data !== 'object'))) {
      throw new ApiError('The server returned an unexpected response. Please check before trying again.', { status: response.status, code: 'INVALID_RESPONSE' })
    }
    if (method !== 'GET' && !path.startsWith('/api/auth')) window.dispatchEvent(new Event('causeconnect:content'))
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (signal?.aborted) throw new ApiError('Request cancelled.', { code: 'ABORTED' })
    throw new ApiError(controller.signal.aborted ? 'The request timed out. Please check your connection and try again.' : 'The service could not be reached. Please try again.', { code: 'NETWORK_ERROR' })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
