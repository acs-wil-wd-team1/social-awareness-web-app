import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AcceptanceError, parseOptions, runLiveAcceptance } from '../acceptance-live.mjs'

const origin = 'https://qa.example.test'
const commit = 'a'.repeat(40)

function fixture({ publicationBug = false, uncertainCreate = false, privateFailure = false } = {}) {
  let now = Date.UTC(2026, 9, 13)
  let nextId = 1
  const calls = []
  const accounts = new Map()
  const sessions = new Map()
  const campaigns = new Map()
  const messages = []
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const error = (status, code, fieldErrors = null) => json(status, { status, code, message: 'Safe error', fieldErrors })
  const fetchImpl = async (url, options) => {
    const route = new URL(url).pathname
    const method = options.method
    calls.push({ route, method, time: now })
    let body
    if (options.body !== undefined) {
      if (options.body.length > 100000) return error(413, 'REQUEST_TOO_LARGE')
      try { body = JSON.parse(options.body) } catch { return error(422, 'VALIDATION_FAILED', { body: 'Send valid JSON' }) }
    }
    if (route === '/release.json') return json(200, {
      application: 'CauseConnect', mode: 'live', commit,
      releaseId: `2026-10-13T16-00-00-000Z-${commit.slice(0, 12)}`, builtAt: '2026-10-13T16:00:00.000Z',
    })
    if (['/', '/campaigns/new', '/my-campaigns', '/admin/campaigns'].includes(route)) return new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })
    if (route === '/api/campaigns/categories') return json(200, { categories: [{ id: 4, name: 'Education' }] })
    if (route === '/api/auth/register') {
      if (privateFailure) return json(500, { message: 'private-password private-token private-sql' })
      if (body.accountType !== 'user') return error(422, 'VALIDATION_FAILED', { accountType: 'Invalid account type' })
      const email = body.email.trim().toLowerCase()
      if (accounts.has(email)) return error(409, 'EMAIL_EXISTS', { email: 'Duplicate email' })
      const account = { id: nextId++, name: body.name, email, password: body.password, role: 'public' }
      accounts.set(email, account)
      return json(201, { message: 'Registered!', user: { id: account.id, name: account.name, role: account.role } })
    }
    if (route === '/api/auth/login') {
      if (!body.password) return error(422, 'VALIDATION_FAILED', { password: 'Required' })
      const account = accounts.get(body.email.trim().toLowerCase())
      if (!account || body.password !== account.password) return error(401, 'INVALID_CREDENTIALS')
      const token = `unit-private-token-${account.id}`
      sessions.set(token, account)
      return json(200, { user: { id: account.id, name: account.name, email: account.email, role: account.role }, token })
    }
    const token = options.headers.Authorization?.replace(/^Bearer /, '')
    const account = sessions.get(token)
    if (route === '/api/auth/logout') {
      if (!account) return json(401, { error: 'Session expired or logged out' })
      sessions.delete(token)
      return new Response(null, { status: 204 })
    }
    if (route === '/api/campaigns/admin') return error(account ? 403 : 401, account ? 'FORBIDDEN' : 'INVALID_TOKEN')
    if (route === '/api/campaigns' && method === 'POST') {
      if (!account) return error(401, 'INVALID_TOKEN')
      if (body.createdBy !== undefined) return error(422, 'VALIDATION_FAILED', { createdBy: 'Not accepted' })
      const campaign = { ...body, id: nextId++, createdBy: account.id, status: 'pending', type: 'cause', businessId: null, imageUrl: null }
      campaigns.set(campaign.id, campaign)
      if (uncertainCreate) throw new Error('private-password private-token private-transport-error')
      return json(201, { campaign })
    }
    if (route === '/api/campaigns/mine') {
      if (!account) return error(401, 'INVALID_TOKEN')
      return json(200, { campaigns: [...campaigns.values()].filter(row => row.createdBy === account.id) })
    }
    if (route.startsWith('/api/campaigns/mine/')) {
      if (!account) return error(401, 'INVALID_TOKEN')
      const campaign = campaigns.get(Number(route.split('/').at(-1)))
      return campaign?.createdBy === account.id ? json(200, campaign) : error(404, 'CAMPAIGN_NOT_FOUND')
    }
    if (route === '/api/campaigns') return json(200, { campaigns: publicationBug ? [...campaigns.values()] : [] })
    if (/^\/api\/campaigns\/\d+$/.test(route)) return publicationBug ? json(200, [...campaigns.values()][0]) : error(404, 'CAMPAIGN_NOT_FOUND')
    throw new Error('Unexpected route')
  }
  return {
    calls, accounts, sessions, campaigns, messages,
    options: { origin, allowQaWrites: true, expectedCommit: commit, fetchImpl, clock: () => now, sleep: async milliseconds => { now += milliseconds }, emit: message => messages.push(message) },
  }
}

test('default CLI parsing is plan-only and rejects unsafe/unscoped origins', () => {
  assert.deepEqual(parseOptions([origin]), { origin, allowQaWrites: false, expectedCommit: undefined })
  assert.deepEqual(parseOptions([origin, '--allow-qa-writes', '--expected-commit', commit]), { origin, allowQaWrites: true, expectedCommit: commit })
  for (const args of [[], ['http://qa.example.test'], ['https://user:private-password@qa.example.test'], [`${origin}/api`], [`${origin}?private=1`], [origin, '--unexpected'], [origin, '--expected-commit', 'short']]) {
    assert.throws(() => parseOptions(args), AcceptanceError)
  }
})

test('the imported runner cannot make any request without explicit QA-write permission', async () => {
  let calls = 0
  await assert.rejects(runLiveAcceptance({ origin, fetchImpl: async () => { calls += 1 } }), /QA writes were not approved/)
  assert.equal(calls, 0)
})

test('the successful plan is paced, stays pending-only and revokes every QA session without leaking credentials', async () => {
  const fake = fixture()
  const result = await runLiveAcceptance(fake.options)
  assert.equal(result.checks, 11)
  assert.equal(result.fixtures.userIds.length, 2)
  assert.equal(fake.accounts.size, 2)
  assert.equal(fake.campaigns.size, 1)
  assert.equal([...fake.campaigns.values()][0].status, 'pending')
  assert.equal(fake.sessions.size, 0)
  assert.equal(fake.calls.some(call => ['PATCH', 'DELETE'].includes(call.method) || call.route.endsWith('/status')), false)
  for (const [route, minimum] of [['/api/auth/register', 13000], ['/api/auth/login', 6500]]) {
    const times = fake.calls.filter(call => call.route === route).map(call => call.time)
    assert.ok(times.slice(1).every((time, index) => time - times[index] >= minimum))
  }
  const output = fake.messages.join('\n')
  for (const account of fake.accounts.values()) assert.equal(output.includes(account.password), false)
  assert.equal(output.includes('unit-private-token-'), false)
  assert.equal(fake.messages.some(message => message.startsWith('QA fixture receipt: ')), true)
})

test('a failed private API response is reported without echoing backend secrets', async () => {
  const fake = fixture({ privateFailure: true })
  await assert.rejects(runLiveAcceptance(fake.options), error => {
    assert.ok(error instanceof AcceptanceError)
    assert.equal(error.message.includes('private-'), false)
    return true
  })
  assert.equal(fake.messages.join('\n').includes('private-password'), false)
  assert.equal(fake.accounts.size, 0)
})

test('an uncertain creation is never retried and already-created sessions are revoked', async () => {
  const fake = fixture({ uncertainCreate: true })
  await assert.rejects(runLiveAcceptance(fake.options), error => {
    assert.match(error.message, /No automatic retry/)
    assert.equal(error.message.includes('private-'), false)
    return true
  })
  assert.equal(fake.calls.filter(call => call.method === 'POST' && call.route === '/api/campaigns').length, 1)
  assert.equal(fake.campaigns.size, 1)
  assert.equal(fake.sessions.size, 0)
})

test('a public-privacy violation fails acceptance and still revokes QA sessions', async () => {
  const fake = fixture({ publicationBug: true })
  await assert.rejects(runLiveAcceptance(fake.options), /Pending campaign privacy failed/)
  assert.equal(fake.sessions.size, 0)
  assert.equal(fake.calls.some(call => call.method === 'PATCH'), false)
})

test('a mismatched release fails before creating any QA accounts', async () => {
  const fake = fixture()
  await assert.rejects(runLiveAcceptance({ ...fake.options, expectedCommit: 'b'.repeat(40) }), /approved release/)
  assert.equal(fake.accounts.size, 0)
})

test('the exact EC2 release metadata shape is accepted without an apiBaseUrl field', async () => {
  const fake = fixture()
  const response = await fake.options.fetchImpl(`${origin}/release.json`, { method: 'GET', headers: {} })
  const metadata = await response.json()
  assert.deepEqual(Object.keys(metadata), ['application', 'mode', 'commit', 'releaseId', 'builtAt'])
  assert.equal(Object.hasOwn(metadata, 'apiBaseUrl'), false)
  assert.equal((await runLiveAcceptance(fake.options)).checks, 11)
})
