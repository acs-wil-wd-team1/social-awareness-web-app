import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AcceptanceError, parseOptions, productionOrigin, runBusinessAcceptance } from '../acceptance-business.mjs'

const commit = 'a'.repeat(40), adminSecret = 'private-admin-password'
function fixture({ badCommit = false, uncertainCreate = false, uncertainApproval = false, uncertainDelete = false,
  leakPending = false, offsitePhoto = false, wrongCampaignOwner = false, leakOtherInbox = false, existingProfile = false,
  wrongDecisionId = false, invalidDecisionVersion = false } = {}) {
  let time = Date.UTC(2026, 9, 14), nextId = 10, revision = 0
  const calls = [], messages = [], accounts = new Map(), sessions = new Map(), profiles = new Map(), campaigns = new Map(), enquiries = []
  const admin = { id: 1, name: 'Existing administrator', email: 'admin@example.test', password: adminSecret, role: 'admin' }
  accounts.set(admin.email, admin)
  const imageId = `img_${'c'.repeat(48)}`, photoPath = `/api/campaign-images/${imageId}/content`
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const err = (status, code) => json(status, { status, code, message: 'private-response-must-not-be-logged' })
  const tick = () => new Date(time + ++revision).toISOString()
  const dto = ({ password, accountType, ...user }) => user
  const profileDto = ({ ownerId, ...profile }) => profile
  const view = (campaign, isPublic = false) => ({ ...campaign,
    ...(wrongCampaignOwner ? { createdBy: 9999 } : {}),
    business: profileDto(profiles.get(campaign.createdBy)),
    imageUrl: offsitePhoto ? 'https://unsafe.example/private?ticket=private-ticket' : isPublic ? photoPath : `${photoPath}?ticket=private-ticket`,
  })
  const fetchImpl = async (url, options) => {
    const { pathname: route, searchParams } = new URL(url), method = options.method
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined
    const token = options.headers.Authorization?.slice(7), user = sessions.get(token)
    calls.push({ route, method, time, body, token, url })
    if (route === '/release.json') return json(200, { application: 'CauseConnect', mode: 'live', commit: badCommit ? 'b'.repeat(40) : commit })
    if (route === '/api/auth/login') {
      const account = accounts.get(body.email)
      assert.equal(body.password, account.password)
      const token = `private-token-${account.id}-${++revision}`
      sessions.set(token, account)
      return json(200, { user: dto(account), token })
    }
    if (route === '/api/auth/register') {
      const account = { ...body, id: nextId++, role: body.accountType === 'business' ? 'business_owner' : 'public' }
      accounts.set(account.email, account)
      return json(201, { user: dto(account) })
    }
    if (route === '/api/auth/logout') {
      if (!sessions.delete(token)) return err(401, 'INVALID_TOKEN')
      return new Response(null, { status: 204 })
    }
    if (route === '/api/business/me') {
      if (!user) return err(401, 'INVALID_TOKEN')
      if (user.role !== 'business_owner') return err(403, 'FORBIDDEN')
      if (method === 'PUT') {
        assert.equal(profiles.has(user.id), false)
        const profile = { id: nextId++, ownerId: user.id, businessName: body.businessName.trim(), abn: null, website: body.website.trim(), description: body.description.trim() }
        profiles.set(user.id, profile)
        return json(200, { business: profileDto(profile) })
      }
      return json(200, { business: existingProfile ? { id: 9999 } : profiles.has(user.id) ? profileDto(profiles.get(user.id)) : null })
    }
    if (route === '/api/campaigns/categories') return json(200, { categories: [{ id: 1, name: 'Education' }] })
    if (route === '/api/campaign-images') {
      assert.equal(user.role, 'business_owner')
      assert.ok(options.body instanceof FormData)
      assert.equal(options.body.get('file').type, 'image/png')
      return json(201, { imageId })
    }
    const campaign = [...campaigns.values()][0]
    if (route === photoPath) return campaign && !campaign.deleted && (searchParams.has('ticket') || campaign.status === 'approved' || leakPending)
      ? new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }) : err(404, 'IMAGE_NOT_FOUND')
    if (route === '/api/campaigns' && method === 'POST') {
      assert.equal(user.role, 'business_owner')
      assert.ok(profiles.has(user.id))
      assert.equal(Object.hasOwn(body, 'businessId'), false)
      assert.equal(Object.hasOwn(body, 'status'), false)
      const row = { ...body, id: nextId++, createdBy: user.id, businessId: profiles.get(user.id).id, type: 'business', status: 'pending', createdAt: tick(), updatedAt: tick() }
      campaigns.set(row.id, row)
      if (uncertainCreate) throw new Error('private-transport-password')
      return json(201, { campaign: view(row) })
    }
    if (route === '/api/campaigns/mine') return user ? json(200, { campaigns: [] }) : err(401, 'INVALID_TOKEN')
    if (/^\/api\/campaigns\/mine\/\d+$/.test(route)) {
      if (!user) return err(401, 'INVALID_TOKEN')
      if (!campaign || campaign.deleted || campaign.createdBy !== user.id || Number(route.split('/').at(-1)) !== campaign.id) return err(404, 'CAMPAIGN_NOT_FOUND')
      if (method === 'DELETE') {
        assert.equal(body.expectedUpdatedAt, campaign.updatedAt)
        campaign.deleted = true
        if (uncertainDelete) throw new Error('private-delete-transport')
        return new Response(null, { status: 204 })
      }
      return json(200, view(campaign))
    }
    if (route === `/api/campaigns/admin/${campaign?.id}`) {
      assert.equal(user.id, admin.id)
      return json(200, view(campaign))
    }
    if (route === `/api/campaigns/admin/${campaign?.id}/status`) {
      assert.equal(user.id, admin.id)
      assert.equal(body.expectedUpdatedAt, campaign.updatedAt)
      assert.equal(body.status, 'approved')
      campaign.status = 'approved'; campaign.updatedAt = tick()
      if (uncertainApproval) throw new Error('private-approval-transport')
      return json(200, { campaign: { id: wrongDecisionId ? campaign.id + 100 : campaign.id, status: campaign.status,
        updatedAt: invalidDecisionVersion ? 'not-a-saved-version' : campaign.updatedAt } })
    }
    if (route === `/api/campaigns/admin/${campaign?.id}/publication`) {
      assert.equal(user.id, admin.id)
      assert.equal(body.expectedUpdatedAt, campaign.updatedAt)
      assert.equal(body.status, 'pending')
      campaign.status = 'pending'; campaign.updatedAt = tick()
      return json(200, { campaign: { id: campaign.id, status: campaign.status, updatedAt: campaign.updatedAt } })
    }
    if (route === `/api/campaigns/${campaign?.id}`) return !campaign.deleted && campaign.status === 'approved'
      ? json(200, view(campaign, true)) : err(404, 'CAMPAIGN_NOT_FOUND')
    if (route === `/api/campaigns/${campaign?.id}/enquiries`) {
      assert.equal(user.role, 'public')
      assert.equal(campaign.status, 'approved')
      const enquiry = { id: nextId++, campaignId: campaign.id, businessId: campaign.businessId, name: body.name.trim(), email: body.email.trim().toLowerCase(), phone: null, message: body.message.trim(), createdAt: tick() }
      enquiries.push(enquiry)
      return json(201, { enquiry })
    }
    if (route === '/api/business/me/enquiries') {
      if (!user) return err(401, 'INVALID_TOKEN')
      if (user.role !== 'business_owner') return err(403, 'FORBIDDEN')
      const profile = profiles.get(user.id)
      const rows = enquiries.filter(row => row.businessId === profile.id || leakOtherInbox).map(row => ({ ...row,
        campaign: campaign && !campaign.deleted && campaign.status === 'approved' ? { id: campaign.id, title: campaign.title, status: campaign.status } : null,
      }))
      return json(200, { enquiries: rows, total: rows.length, page: 1, pageSize: 10 })
    }
    throw new Error('Unexpected stub route')
  }
  return { calls, messages, accounts, sessions, profiles, campaigns, enquiries, options: {
    origin: 'http://127.0.0.1:8765', allowQaWrites: true, expectedCommit: commit,
    env: { CAUSECONNECT_QA_ADMIN_EMAIL: admin.email, CAUSECONNECT_QA_ADMIN_PASSWORD: adminSecret },
    fetchImpl, emit: message => messages.push(message), clock: () => time, sleep: async milliseconds => { time += milliseconds },
    imageFactory: async () => new Uint8Array([137, 80, 78, 71]),
  } }
}

test('default plan is pinned and all unsafe targets/flags are refused', () => {
  assert.deepEqual(parseOptions([]), { origin: productionOrigin, allowQaWrites: false, expectedCommit: undefined })
  assert.equal(parseOptions(['http://127.0.0.1:8765']).allowQaWrites, false)
  for (const args of [['https://other.example'], ['http://52.62.2.87'], [`${productionOrigin}/api`], [`${productionOrigin}?secret=value`],
    ['--allow-qa-writes'], ['--expected-commit', 'short'], ['--allow-qa-writes', '--allow-qa-writes', '--expected-commit', commit]]) {
    assert.throws(() => parseOptions(args), AcceptanceError)
  }
})
test('write approval, exact commit and environment credentials are mandatory before requests', async () => {
  let calls = 0
  for (const options of [{}, { allowQaWrites: true }, { allowQaWrites: true, expectedCommit: commit, env: {} }]) {
    await assert.rejects(runBusinessAcceptance({ ...options, fetchImpl: async () => { calls += 1 } }), AcceptanceError)
  }
  assert.equal(calls, 0)
})
test('CLI defaults to an explicit no-request plan without credentials', () => {
  const script = fileURLToPath(new URL('../acceptance-business.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: {} })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Plan only: no network requests or writes were made/)
  assert.match(result.stdout, /two synthetic business owners and one public enquirer/)
  assert.doesNotMatch(result.stdout, /PASS |fixture receipt/)
})
test('CLI rejects an unsafe target and incomplete write approval before network work', () => {
  const script = fileURLToPath(new URL('../acceptance-business.mjs', import.meta.url))
  for (const args of [['https://other.example'], ['--allow-qa-writes']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: {} })
    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stdout, /PASS |fixture receipt/)
  }
})
test('full stub journey passes eight groups, retains history and scopes every mutation', async () => {
  const fake = fixture(), result = await runBusinessAcceptance(fake.options)
  assert.equal(result.checks, 8)
  assert.equal(fake.accounts.size, 4)
  assert.equal(fake.profiles.size, 2)
  assert.equal(fake.enquiries.length, 1)
  assert.equal(fake.sessions.size, 0)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal(result.fixtures.campaignDeleted, true)
  assert.deepEqual(result.fixtures.uncertainWrites, [])
  assert.equal(fake.calls.filter(call => call.route === '/api/campaigns' && call.method === 'POST').length, 1)
  assert.equal(fake.calls.filter(call => call.method === 'DELETE').length, 1)
  assert.equal(fake.calls.some(call => call.route.includes('/api/businesses') || call.route.includes('/api/admin/users')), false)
  const output = fake.messages.join('\n')
  for (const secret of [adminSecret, 'private-token-', 'private-ticket', 'private-response', ...[...fake.accounts.values()].map(row => row.password)]) assert.equal(output.includes(secret), false)
  assert.equal(output.includes('https://example.com'), false)
  for (const [route, gap] of [['/api/auth/register', 13000], ['/api/auth/login', 6500]]) {
    const times = fake.calls.filter(call => call.route === route).map(call => call.time)
    assert.ok(times.slice(1).every((time, index) => time - times[index] >= gap))
  }
})
test('wrong served commit makes no write requests', async () => {
  const fake = fixture({ badCommit: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /approved release/)
  assert.equal(fake.calls.filter(call => call.method !== 'GET').length, 0)
})
test('imported category preference rejects invalid IDs before requests', async () => {
  for (const preferredCategoryId of ['1', 0, 1.5, true, 2147483648]) {
    const fake = fixture()
    await assert.rejects(runBusinessAcceptance({ ...fake.options, preferredCategoryId }), /positive JSON integer/)
    assert.equal(fake.calls.length, 0)
  }
})
test('an absent preferred category is refused before any writes', async () => {
  const fake = fixture()
  await assert.rejects(runBusinessAcceptance({ ...fake.options, preferredCategoryId: 999 }), /No usable requested category/)
  assert.equal(fake.calls.filter(call => call.method !== 'GET').length, 0)
  assert.equal(fake.sessions.size, 0)
})
test('fresh owner unexpectedly having a profile is never overwritten', async () => {
  const fake = fixture({ existingProfile: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /refusing to overwrite/)
  assert.equal(fake.calls.some(call => call.route === '/api/business/me' && call.method === 'PUT'), false)
  assert.equal(fake.sessions.size, 0)
})
test('unknown campaign creation outcome is not retried or broadly searched/deleted', async () => {
  const fake = fixture({ uncertainCreate: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /No automatic retry/)
  assert.equal(fake.calls.filter(call => call.route === '/api/campaigns' && call.method === 'POST').length, 1)
  assert.equal(fake.calls.some(call => call.method === 'DELETE'), false)
  assert.equal(fake.sessions.size, 0)
  assert.equal(fake.messages.some(message => message.includes('"uncertainWrites":["QA business campaign creation"]')), true)
  assert.equal(fake.messages.join('\n').includes('private-transport'), false)
})
test('uncertain approval is not repeated; only known scoped fixture is removed', async () => {
  const fake = fixture({ uncertainApproval: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /No automatic retry/)
  assert.equal(fake.calls.filter(call => call.route.endsWith('/status') && call.method === 'PATCH').length, 1)
  assert.equal(fake.calls.filter(call => call.method === 'DELETE').length, 1)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal(fake.sessions.size, 0)
})
test('uncertain deletion is never resent during final cleanup', async () => {
  const fake = fixture({ uncertainDelete: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /No automatic retry/)
  assert.equal(fake.calls.filter(call => call.method === 'DELETE').length, 1)
  assert.equal(fake.sessions.size, 0)
  assert.equal(fake.messages.some(message => message.includes('"uncertainWrites":["QA business campaign soft-delete"]')), true)
})
test('pending public photo leakage stops before approval and cleans scoped fixture', async () => {
  const fake = fixture({ leakPending: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /Pending business photo privacy/)
  assert.equal(fake.calls.some(call => call.route.endsWith('/status') && call.method === 'PATCH'), false)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal(fake.sessions.size, 0)
})
test('off-origin private photo never receives a request or leaks its ticket', async () => {
  const fake = fixture({ offsitePhoto: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /scoped signed URL/)
  assert.equal(fake.calls.some(call => new URL(call.url).origin !== fake.options.origin), false)
  assert.equal(fake.messages.join('\n').includes('private-ticket'), false)
  assert.equal(fake.sessions.size, 0)
})
test('unexpected owner in readback prevents approval and destructive cleanup', async () => {
  const fake = fixture({ wrongCampaignOwner: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /outside the scoped QA fixture/)
  assert.equal(fake.calls.some(call => call.method === 'DELETE' || call.route.endsWith('/status')), false)
  assert.equal(fake.sessions.size, 0)
})
test('cross-business inbox leakage fails safely without resending the enquiry', async () => {
  const fake = fixture({ leakOtherInbox: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /Another business owner/)
  assert.equal(fake.calls.filter(call => call.route.endsWith('/enquiries') && call.method === 'POST').length, 1)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal(fake.sessions.size, 0)
})
test('wrong decision receipt ID is rejected and only the known fixture is cleaned up', async () => {
  const fake = fixture({ wrongDecisionId: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /scoped QA ID, status and fresh saved version/)
  assert.equal(fake.calls.filter(call => call.route.endsWith('/status') && call.method === 'PATCH').length, 1)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal(fake.sessions.size, 0)
})
test('invalid saved decision version is rejected without repeating approval', async () => {
  const fake = fixture({ invalidDecisionVersion: true })
  await assert.rejects(runBusinessAcceptance(fake.options), /scoped QA ID, status and fresh saved version/)
  assert.equal(fake.calls.filter(call => call.route.endsWith('/status') && call.method === 'PATCH').length, 1)
  assert.equal([...fake.campaigns.values()][0].deleted, true)
  assert.equal(fake.sessions.size, 0)
})
