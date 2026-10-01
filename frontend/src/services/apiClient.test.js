import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, apiUrl } from './apiClient.js'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
function response(status, data) {
  return { status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(data) }
}

describe('API address configuration', () => {
  it.each([
    ['/api/campaigns', '/api', '/api/campaigns'],
    ['campaigns', '/api/', '/api/campaigns'],
    ['/api/campaigns?page=2', 'https://api.example.test/api/', 'https://api.example.test/api/campaigns?page=2'],
    ['/api/auth/logout', 'http://127.0.0.1:3000/api', 'http://127.0.0.1:3000/api/auth/logout'],
    ['/campaigns', 'http://localhost:3000/api', 'http://localhost:3000/api/campaigns'],
  ])('joins %s with %s without duplicating the API prefix', (path, base, expected) => {
    expect(apiUrl(path, base)).toBe(expected)
  })

  it.each([
    '//outside.example/api', 'javascript:alert(1)', '/other-api',
    'http://remote.example/api', 'https://user:password@example.test/api',
    'https://example.test/api?token=secret', 'https://example.test/api#fragment',
    'https://', 'https://bad host/api',
  ])('rejects an unsafe or invalid configured origin: %s', (base) => {
    expect(() => apiUrl('/campaigns', base)).toThrow(ApiError)
    try { apiUrl('/campaigns', base) } catch (error) { expect(error.code).toBe('CONFIG_ERROR') }
  })
})

describe('API requests', () => {
  it('announces confirmed content changes but not reads or rejected writes', async () => {
    const listener = vi.fn()
    window.addEventListener('causeconnect:content', listener)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(200, { campaign: {} }))
      .mockResolvedValueOnce(response(200, {})).mockResolvedValueOnce(response(422, {})))
    await apiRequest('/api/campaigns/mine/1', { method: 'PATCH', expectedStatus: 200 })
    await apiRequest('/api/campaigns')
    await expect(apiRequest('/api/campaigns/mine/1', { method: 'PATCH' })).rejects.toMatchObject({ status: 422 })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('causeconnect:content', listener)
  })
  it('sends JSON and a bearer token and reads a successful response', async () => {
    const fetch = vi.fn().mockResolvedValue(response(201, { campaign: { id: 4 } }))
    vi.stubGlobal('fetch', fetch)
    const result = await apiRequest('/api/campaigns', { method: 'POST', body: { title: 'Food drive' }, token: 'test-token', expectedStatus: 201 })
    expect(result).toEqual({ campaign: { id: 4 } })
    expect(fetch).toHaveBeenCalledWith('/api/campaigns', expect.objectContaining({
      method: 'POST', body: '{"title":"Food drive"}',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      signal: expect.any(AbortSignal),
    }))
  })

  it('lets the browser supply the multipart boundary for a file upload', async () => {
    const fetch = vi.fn().mockResolvedValue(response(201, { image: { id: 1 } }))
    vi.stubGlobal('fetch', fetch)
    const body = new FormData()
    body.append('image', new File(['data'], 'image.jpg', { type: 'image/jpeg' }))
    await apiRequest('/api/campaign-images', { method: 'POST', body, token: 'test-token' })
    expect(fetch.mock.calls[0][1].body).toBe(body)
    expect(fetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer test-token' })
  })

  it('accepts 204 without reading a JSON body', async () => {
    const reply = response(204, undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply))
    await expect(apiRequest('/api/auth/logout', { method: 'PUT', expectedStatus: 204 })).resolves.toBeNull()
    expect(reply.json).not.toHaveBeenCalled()
  })

  it('rejects an unexpected success status rather than claiming a saved record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { campaign: { id: 1 } })))
    await expect(apiRequest('/api/campaigns', { method: 'POST', expectedStatus: 201 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
  })

  it('rejects HTML or unreadable responses from a misconfigured host', async () => {
    const reply = response(200, null)
    reply.json.mockRejectedValue(new SyntaxError('HTML is not JSON'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply))
    await expect(apiRequest('/api/campaigns')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('keeps field errors as strings and preserves the server error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(422, {
      message: 'Check the form', code: 'VALIDATION_FAILED',
      fieldErrors: { title: 'Required', details: { message: 'Invalid' }, category: ['Invalid'], imageId: null },
    })))
    await expect(apiRequest('/api/campaigns', { method: 'POST' })).rejects.toMatchObject({
      status: 422, code: 'VALIDATION_FAILED', message: 'Check the form', fieldErrors: { title: 'Required' },
    })
  })

  it('discards malformed array field errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(422, { fieldErrors: ['Wrong'] })))
    await expect(apiRequest('/api/campaigns')).rejects.toMatchObject({ fieldErrors: {} })
  })

  it('normalizes malformed server messages and error codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, {
      message: { detail: 'Unexpected object' }, code: { value: 'BROKEN' }, fieldErrors: 'Invalid',
    })))
    await expect(apiRequest('/api/campaigns')).rejects.toMatchObject({
      message: 'The request could not be completed.', code: 'REQUEST_FAILED', fieldErrors: {},
    })
  })

  it('reports unavailable APIs with a useful fallback message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(503, null)))
    await expect(apiRequest('/api/campaigns')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('not available') })
  })

  it('announces which token was rejected so a newer session is not cleared', async () => {
    const listener = vi.fn()
    window.addEventListener('causeconnect:unauthorized', listener)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { message: 'Expired' })))
    await expect(apiRequest('/api/campaigns/mine', { token: 'expired-token' })).rejects.toMatchObject({ status: 401 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail).toEqual({ token: 'expired-token' })
    window.removeEventListener('causeconnect:unauthorized', listener)
  })

  it('does not announce session loss for a rejected anonymous login', async () => {
    const listener = vi.fn()
    window.addEventListener('causeconnect:unauthorized', listener)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, {})))
    await expect(apiRequest('/api/auth/login', { method: 'POST' })).rejects.toMatchObject({ status: 401 })
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener('causeconnect:unauthorized', listener)
  })

  it('does not fetch a request whose caller already cancelled it', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(apiRequest('/api/campaigns', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('passes cancellation to an in-flight request', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const controller = new AbortController()
    const pending = apiRequest('/api/campaigns', { signal: controller.signal })
    const assertion = expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
    controller.abort()
    await assertion
  })

  it('ends requests that exceed the timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const assertion = expect(apiRequest('/api/campaigns', { timeoutMs: 100 })).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('timed out') })
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['cancel', 'timeout'])('preserves %s while the response body is still arriving', async (reason) => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_url, { signal }) => ({
      status: 200,
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }),
    })))
    const controller = new AbortController()
    const pending = apiRequest('/api/campaigns', { signal: controller.signal, timeoutMs: 100 }).catch(error => error)
    // Headers have arrived, but fetch has not finished reading the body.
    await Promise.resolve()
    if (reason === 'cancel') controller.abort()
    else await vi.advanceTimersByTimeAsync(100)
    expect(await pending).toMatchObject(reason === 'cancel'
      ? { code: 'ABORTED' }
      : { code: 'NETWORK_ERROR', message: expect.stringContaining('timed out') })
    expect(vi.getTimerCount()).toBe(0)
  })
})
