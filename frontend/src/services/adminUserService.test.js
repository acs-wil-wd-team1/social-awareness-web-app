import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeUserStatus, loadAdminUsers } from './adminUserService.js'

const user = { id: 4, name: 'Alex', email: 'alex@example.test', role: 'public', status: 'active', createdAt: '2026-09-30T00:00:00Z' }
function respond(body, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))
}
afterEach(() => vi.unstubAllGlobals())

describe('admin account API', () => {
  it('requests paginated account records with encoded search and a bearer token', async () => {
    respond({ users: [user], page: 2, pageSize: 10, total: 11 })
    expect((await loadAdminUsers({ token: 'a', page: 2, search: 'Alex & Co', status: 'active' })).users).toEqual([user])
    const [url, options] = fetch.mock.calls[0]
    expect(new URL(url, 'https://test.invalid').searchParams.get('search')).toBe('Alex & Co')
    expect(options.headers.Authorization).toBe('Bearer a')
  })
  it('rejects malformed account lists and anonymous requests', async () => {
    respond({ users: [{ ...user, role: 'root' }], page: 1, pageSize: 10, total: 1 })
    await expect(loadAdminUsers()).rejects.toMatchObject({ status: 401 })
    await expect(loadAdminUsers({ token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('sends only the allowed status field and verifies the saved identity', async () => {
    respond({ user: { ...user, status: 'suspended' } })
    await expect(changeUserStatus(4, 'suspended', { token: 'a' })).resolves.toMatchObject({ id: 4, status: 'suspended' })
    expect(fetch.mock.calls[0][0]).toBe('/api/admin/users/4/status')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ status: 'suspended' })
    respond({ user: { ...user, id: 5, status: 'suspended' } })
    await expect(changeUserStatus(4, 'suspended', { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('refuses unsupported statuses and an apparent administrator mutation result', async () => {
    respond({ user: { ...user, role: 'admin', status: 'suspended' } })
    await expect(changeUserStatus(4, 'admin', { token: 'a' })).rejects.toMatchObject({ status: 422 })
    await expect(changeUserStatus(4, 'suspended', { token: 'a' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
