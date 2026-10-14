import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AcceptanceError, parseOptions, productionOrigin, runAdditionalAcceptance } from '../acceptance-additional.mjs'

const commit = 'a'.repeat(40)
const adminSecret = 'private-admin-password'
function fixture({ uncertainCreate = false, badCommit = false, leakPublic = false, offsitePhoto = false } = {}) {
  let time = Date.UTC(2026, 9, 13), id = 10, revision = 0
  const calls = [], messages = [], accounts = new Map(), sessions = new Map(), campaigns = new Map(), reviews = []
  const admin = { id: 1, name: 'Existing administrator', email: 'admin@example.test', password: adminSecret, role: 'admin', status: 'active' }
  accounts.set(admin.email, admin)
  const imageId = `img_${'b'.repeat(48)}`, photoPath = `/api/campaign-images/${imageId}/content`
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const err = (status, code) => json(status, { status, code, message: 'private-response-must-not-be-logged' })
  const dto = ({ password, ...user }) => ({ ...user, createdAt: '2026-10-13T00:00:00.000Z' })
  const tick = () => new Date(time + ++revision).toISOString()
  const photo = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } })
  const view = (campaign, isPublic = false) => ({ ...campaign, imageUrl: offsitePhoto ? 'https://unsafe.example/private?ticket=private-ticket' : isPublic ? photoPath : `${photoPath}?ticket=private-ticket` })
  let participation
  const fetchImpl = async (url, options) => {
    const { pathname: route, searchParams } = new URL(url), method = options.method
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined
    const token = options.headers.Authorization?.slice(7), user = sessions.get(token)
    calls.push({ route, method, time, body })
    if (route === '/release.json') return json(200, { application: 'CauseConnect', mode: 'live', commit: badCommit ? 'b'.repeat(40) : commit })
    if (route === '/api/auth/login') {
      const account = accounts.get(body.email)
      if (!account || body.password !== account.password) return err(401, 'INVALID_CREDENTIALS')
      if (account.status === 'suspended') return err(403, 'ACCOUNT_SUSPENDED')
      const token = `private-token-${account.id}-${++revision}`
      sessions.set(token, account)
      return json(200, { user: dto(account), token })
    }
    if (route === '/api/auth/register') {
      const account = { ...body, id: id++, role: 'public', status: 'active' }
      delete account.accountType
      accounts.set(account.email, account)
      return json(201, { user: dto(account) })
    }
    if (route === '/api/auth/logout') {
      if (!sessions.delete(token)) return err(401, 'INVALID_TOKEN')
      return new Response(null, { status: 204 })
    }
    if (route === '/api/campaigns/categories') return json(200, { categories: [{ id: 1, name: 'Education' }] })
    if (route === '/api/campaign-images') {
      assert.ok(options.body instanceof FormData)
      assert.equal(options.body.get('file').type, 'image/png')
      return json(201, { imageId })
    }
    const campaign = [...campaigns.values()][0]
    if (route === photoPath) return campaign && !campaign.deleted && (searchParams.has('ticket') || campaign.status === 'approved' || leakPublic) ? photo() : err(404, 'IMAGE_NOT_FOUND')
    if (route === '/api/campaigns' && method === 'POST') {
      const row = { ...body, id: id++, createdBy: user.id, status: 'pending', type: 'cause', businessId: null, createdAt: tick(), updatedAt: tick() }
      campaigns.set(row.id, row)
      if (uncertainCreate) throw new Error('private-transport-password')
      return json(201, { campaign: view(row) })
    }
    if (/^\/api\/campaigns\/mine\/\d+$/.test(route)) {
      if (!user) return err(401, 'INVALID_TOKEN')
      if (!campaign || campaign.deleted || campaign.createdBy !== user.id) return err(404, 'CAMPAIGN_NOT_FOUND')
      if (method === 'PATCH') {
        assert.equal(body.expectedUpdatedAt, campaign.updatedAt)
        Object.assign(campaign, body, { status: 'pending', updatedAt: tick() })
        return json(200, { campaign: view(campaign) })
      }
      if (method === 'DELETE') {
        assert.equal(body.expectedUpdatedAt, campaign.updatedAt)
        campaign.deleted = true
        return new Response(null, { status: 204 })
      }
      return json(200, view(campaign))
    }
    if (route === `/api/campaigns/admin/${campaign?.id}/status`) {
      assert.equal(user.id, admin.id)
      if (body.expectedUpdatedAt !== campaign.updatedAt) return err(409, 'CAMPAIGN_CHANGED')
      campaign.status = body.status; campaign.updatedAt = tick()
      const review = { id: reviews.length + 1, campaignId: campaign.id, action: body.status, comments: body.comments }
      reviews.push(review)
      return json(200, { campaign, review })
    }
    if (route === `/api/campaigns/admin/${campaign?.id}/publication`) {
      assert.equal(user.id, admin.id); assert.equal(body.expectedUpdatedAt, campaign.updatedAt)
      campaign.status = 'pending'; campaign.updatedAt = tick()
      return json(200, { campaign })
    }
    if (route === `/api/campaigns/admin/${campaign?.id}/reviews`) return json(200, { reviews, total: reviews.length, page: 1, pageSize: 10 })
    if (route === `/api/campaigns/admin/${campaign?.id}`) return json(200, view(campaign))
    if (route === `/api/campaigns/${campaign?.id}`) return !campaign.deleted && campaign.status === 'approved' ? json(200, view(campaign, true)) : err(404, 'CAMPAIGN_NOT_FOUND')
    if (route === '/api/campaigns') return json(200, { campaigns: [view(campaign, true)], page: 1, pageSize: 20, total: 1 })
    if (route.endsWith('/participation')) {
      assert.equal(method, 'PUT')
      participation = { id: 1, campaignId: campaign.id, status: body.status }
      return json(200, { participation })
    }
    if (route === '/api/participations/mine') return user ? json(200, { participations: [participation], total: 1 }) : err(401, 'INVALID_TOKEN')
    if (route === '/api/admin/users') return json(200, { users: [...accounts.values()].filter(row => row.email === searchParams.get('search')).map(dto), total: 1, page: 1, pageSize: 100 })
    if (/^\/api\/admin\/users\/\d+\/status$/.test(route)) {
      const target = [...accounts.values()].find(row => row.id === Number(route.split('/')[4]))
      assert.notEqual(target.id, admin.id)
      assert.match(target.email, /^qa-[a-f0-9]+-participant@example\.test$/)
      target.status = body.status
      if (body.status === 'suspended') for (const [key, session] of sessions) if (session.id === target.id) sessions.delete(key)
      return json(200, { user: dto(target) })
    }
    if (route === '/api/business/me') return err(404, 'NOT_FOUND')
    throw new Error('Unexpected stub route')
  }
  return { calls, messages, accounts, sessions, campaigns, reviews, options: {
    origin: 'http://127.0.0.1:8765', allowQaWrites: true, expectedCommit: commit,
    env: { CAUSECONNECT_QA_ADMIN_EMAIL: admin.email, CAUSECONNECT_QA_ADMIN_PASSWORD: adminSecret },
    fetchImpl, emit: value => messages.push(value), clock: () => time, sleep: async ms => { time += ms }, imageFactory: async () => new Uint8Array([137, 80, 78, 71]),
  } }
}

test('plan only defaults to pinned production and rejects unsafe targets/flags', () => {
  assert.deepEqual(parseOptions([]), { origin: productionOrigin, allowQaWrites: false, expectedCommit: undefined })
  assert.equal(parseOptions(['http://127.0.0.1:8765']).allowQaWrites, false)
  for (const args of [['https://other.example'], ['http://52.62.2.87'], [`${productionOrigin}/api`], [`${productionOrigin}?ticket=private`], ['--allow-qa-writes'], ['--expected-commit', 'short'], ['--allow-qa-writes', '--allow-qa-writes', '--expected-commit', commit]]) assert.throws(() => parseOptions(args), AcceptanceError)
})
test('approval, expected commit and environment credentials are required before requests', async () => {
  let calls = 0
  for (const options of [{}, { allowQaWrites: true }, { allowQaWrites: true, expectedCommit: commit, env: {} }]) {
    await assert.rejects(runAdditionalAcceptance({ ...options, fetchImpl: async () => { calls += 1 } }), AcceptanceError)
  }
  assert.equal(calls, 0)
})
test('full stub flow scopes all writes and cleans campaign/sessions without printing secrets', async () => {
  const fake = fixture(), result = await runAdditionalAcceptance(fake.options)
  assert.equal(result.checks, 8)
  assert.equal(fake.accounts.size, 3)
  assert.equal(fake.sessions.size, 0)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal([...fake.accounts.values()].find(row => row.name.endsWith('participant')).status, 'active')
  assert.equal(fake.reviews.length, 2)
  assert.deepEqual(result.fixtures.remaining, ['Kim business profile API'])
  assert.deepEqual(result.fixtures.uncertainWrites, [])
  const output = fake.messages.join('\n')
  for (const secret of [adminSecret, 'private-token-', 'private-ticket', 'private-response', ...[...fake.accounts.values()].map(row => row.password)]) assert.equal(output.includes(secret), false)
  for (const [route, gap] of [['/api/auth/register', 13000], ['/api/auth/login', 6500]]) {
    const times = fake.calls.filter(call => call.route === route).map(call => call.time)
    assert.ok(times.slice(1).every((time, index) => time - times[index] >= gap))
  }
})
test('wrong release makes no writes', async () => {
  const fake = fixture({ badCommit: true })
  await assert.rejects(runAdditionalAcceptance(fake.options), /approved release/)
  assert.equal(fake.calls.filter(call => call.method !== 'GET').length, 0)
})
test('unconfirmed creation is never retried; known sessions are revoked and uncertainty is reported', async () => {
  const fake = fixture({ uncertainCreate: true })
  await assert.rejects(runAdditionalAcceptance(fake.options), /No automatic retry/)
  assert.equal(fake.calls.filter(call => call.route === '/api/campaigns' && call.method === 'POST').length, 1)
  assert.equal(fake.sessions.size, 0)
  assert.equal(fake.messages.join('\n').includes('private-transport-password'), false)
  assert.equal(fake.messages.some(message => message.includes('"uncertainWrites":["QA campaign creation"]')), true)
})
test('private photo visibility failure stops approval and cleans only the scoped campaign', async () => {
  const fake = fixture({ leakPublic: true })
  await assert.rejects(runAdditionalAcceptance(fake.options), /Pending photo privacy/)
  assert.equal(fake.reviews.length, 0)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal(fake.sessions.size, 0)
})
test('off-origin signed photo is refused without fetching it or printing its ticket', async () => {
  const fake = fixture({ offsitePhoto: true })
  await assert.rejects(runAdditionalAcceptance(fake.options), /scoped signed URL/)
  assert.equal(fake.calls.some(call => call.route === '/private'), false)
  assert.equal(fake.messages.join('\n').includes('private-ticket'), false)
  assert.equal(fake.sessions.size, 0)
})
