#!/usr/bin/env node
// Opt-in live checks. Makes only private QA fixtures; never approves/publishes.
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const acceptancePlan = [
  'Check the live release, HTTPS page and direct-link refresh.',
  'Register two temporary community accounts with private random passwords.',
  'Check duplicate/admin-signup rejection and login validation.',
  'Create one text-only pending QA campaign and verify owner-only access.',
  'Verify guests/non-admins are denied and the pending campaign stays non-public.',
  'Log out, verify the old token is rejected, and revoke remaining QA sessions.',
]

export class AcceptanceError extends Error {
  constructor(message) { super(message); this.name = 'AcceptanceError' }
}

export function parseOptions(args) {
  const [target, ...flags] = args
  if (!target) throw new AcceptanceError('Supply the exact HTTPS application origin.')
  let url
  try { url = new URL(target) } catch { throw new AcceptanceError('Use an HTTPS origin without credentials, path, query or fragment.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new AcceptanceError('Use an HTTPS origin without credentials, path, query or fragment.')
  }
  let allowQaWrites = false
  let expectedCommit
  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] === '--allow-qa-writes') allowQaWrites = true
    else if (flags[index] === '--expected-commit') {
      expectedCommit = flags[++index]
      if (!/^[a-f0-9]{40}$/i.test(expectedCommit || '')) throw new AcceptanceError('Expected commit must be a complete Git commit SHA.')
    } else throw new AcceptanceError('Only --allow-qa-writes and --expected-commit are accepted.')
  }
  return { origin: url.origin, allowQaWrites, expectedCommit }
}

export async function runLiveAcceptance({
  origin, allowQaWrites = false, expectedCommit,
  fetchImpl = fetch, emit = console.log, clock = Date.now,
  sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  // Validate again for imported callers; a test helper cannot bypass the gate.
  origin = parseOptions([origin]).origin
  if (!allowQaWrites) throw new AcceptanceError('QA writes were not approved. No requests were sent.')
  const run = randomBytes(10).toString('hex')
  const password = randomBytes(32).toString('base64url')
  const accountValues = [0, 1].map(index => ({
    name: `QA ${run} ${index === 0 ? 'owner' : 'other'}`,
    email: `qa-${run}-${index}@example.test`, password, accountType: 'user',
  }))
  const fixtures = { run, userIds: [], campaignId: null }
  const activeTokens = new Set()
  const lastAuthRequest = new Map()
  let checks = 0
  let failure

  function requireCondition(condition, message) {
    if (!condition) throw new AcceptanceError(message)
  }
  function passed(message) { checks += 1; emit(`PASS ${message}`) }
  function requireStatus(result, status, label, code) {
    requireCondition(result.status === status, `${label} failed (HTTP ${result.status}; expected ${status}).`)
    if (code) requireCondition(result.body?.code === code, `${label} did not return the expected error code.`)
  }
  async function send(route, { method = 'GET', token, value, rawBody, json = true } = {}) {
    // Respect Nginx's per-IP 5/min registration and 10/min login limits.
    const gap = route === '/api/auth/register' ? 13000 : route === '/api/auth/login' ? 6500 : 0
    if (method === 'POST' && gap) {
      const previous = lastAuthRequest.get(route)
      if (previous !== undefined) {
        const remaining = gap - (clock() - previous)
        if (remaining > 0) await sleep(remaining)
      }
      lastAuthRequest.set(route, clock())
    }
    let response
    try {
      response = await fetchImpl(`${origin}${route}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(value !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(value !== undefined || rawBody !== undefined ? { body: rawBody ?? JSON.stringify(value) } : {}),
      })
    } catch {
      // A timed-out write may have succeeded. Never retry it automatically.
      throw new AcceptanceError(`Request could not be confirmed: ${method} ${route}. No automatic retry was made.`)
    }
    if (!json) return { status: response.status, contentType: response.headers.get('content-type') || '' }
    if (response.status === 204) return { status: 204, body: null }
    requireCondition((response.headers.get('content-type') || '').includes('application/json'), `Expected JSON from ${method} ${route} (HTTP ${response.status}).`)
    let body
    try { body = await response.json() } catch { throw new AcceptanceError(`Invalid JSON from ${method} ${route}.`) }
    return { status: response.status, body }
  }

  try {
    emit('Checking only implemented core flows. Passwords and tokens will not be printed. Allow about two minutes for paced authentication checks.')
    const release = await send('/release.json')
    requireStatus(release, 200, 'Release metadata')
    // EC2 packaging writes {application, mode, commit, releaseId, builtAt}; it
    // does not retain package-frontend's apiBaseUrl metadata. The checks below
    // verify real /api requests on this exact origin instead of assuming a field.
    requireCondition(release.body?.application === 'CauseConnect' && release.body.mode === 'live'
      && /^[a-f0-9]{40}$/i.test(release.body.commit || ''), 'The served release is not a valid live application release.')
    if (expectedCommit) requireCondition(release.body.commit === expectedCommit, 'The served commit does not match the approved release.')
    for (const route of ['/', '/campaigns/new', '/my-campaigns', '/admin/campaigns']) {
      const page = await send(route, { json: false })
      requireStatus(page, 200, 'Direct-link hosting')
      requireCondition(page.contentType.includes('text/html'), 'A direct application link did not return the SPA document.')
    }
    passed('Live release and direct-link hosting')

    const categories = await send('/api/campaigns/categories')
    requireStatus(categories, 200, 'Category lookup')
    const category = categories.body?.categories?.find(row => Number.isSafeInteger(row.id) && row.id > 0 && typeof row.name === 'string' && row.name.trim())
    requireCondition(Boolean(category), 'No usable campaign category is available in the cloud database.')
    passed('Database-backed categories')

    for (const values of accountValues) {
      const registered = await send('/api/auth/register', { method: 'POST', value: values })
      requireStatus(registered, 201, 'QA registration')
      requireCondition(Number.isSafeInteger(registered.body?.user?.id) && registered.body.user.id > 0, 'QA registration did not return a valid account ID.')
      fixtures.userIds.push(registered.body.user.id)
      requireCondition(registered.body.user.role === 'public', 'QA registration did not return a community account.')
      requireCondition(registered.body.password === undefined && registered.body.user.passwordHash === undefined && registered.body.token === undefined, 'Registration exposed unexpected credentials.')
    }
    passed('Two real community registrations')

    const duplicate = await send('/api/auth/register', { method: 'POST', value: { ...accountValues[0], email: ` ${accountValues[0].email.toUpperCase()} ` } })
    requireStatus(duplicate, 409, 'Duplicate-email rejection', 'EMAIL_EXISTS')
    const adminSignup = await send('/api/auth/register', { method: 'POST', value: { ...accountValues[0], email: `qa-${run}-admin-attempt@example.test`, accountType: 'admin' } })
    requireStatus(adminSignup, 422, 'Admin-signup rejection', 'VALIDATION_FAILED')
    requireCondition(typeof adminSignup.body.fieldErrors?.accountType === 'string', 'Admin signup was not rejected on its account type.')
    passed('Duplicate registration and admin-signup rejection')

    const tokens = []
    for (const [index, values] of accountValues.entries()) {
      const result = await send('/api/auth/login', { method: 'POST', value: { email: ` ${values.email.toUpperCase()} `, password } })
      requireStatus(result, 200, 'QA login')
      requireCondition(typeof result.body?.token === 'string' && result.body.token.trim(), 'Login did not return a usable session.')
      tokens.push(result.body.token)
      activeTokens.add(result.body.token)
      requireCondition(result.body.user?.id === fixtures.userIds[index] && result.body.user.role === 'public', 'Login did not return the expected real account.')
    }
    const [ownerToken, otherToken] = tokens
    passed('Real normalized-email logins')

    const wrongLogin = await send('/api/auth/login', { method: 'POST', value: { email: accountValues[0].email, password: randomBytes(20).toString('hex') } })
    requireStatus(wrongLogin, 401, 'Wrong-password rejection', 'INVALID_CREDENTIALS')
    const missingLogin = await send('/api/auth/login', { method: 'POST', value: { email: accountValues[0].email } })
    requireStatus(missingLogin, 422, 'Missing-password rejection', 'VALIDATION_FAILED')
    const malformed = await send('/api/auth/login', { method: 'POST', rawBody: '{"password":' })
    requireStatus(malformed, 422, 'Malformed authentication JSON', 'VALIDATION_FAILED')
    requireCondition(malformed.body.stack === undefined && typeof malformed.body.fieldErrors?.body === 'string', 'Malformed JSON did not return a safe body error.')
    const oversized = await send('/api/auth/login', { method: 'POST', value: { password: 'x'.repeat(110000) } })
    requireStatus(oversized, 413, 'Oversized authentication JSON', 'REQUEST_TOO_LARGE')
    passed('Credential validation and safe parser errors')

    const start = new Date(clock() + 2 * 86400000).toISOString().slice(0, 10)
    const end = new Date(clock() + 3 * 86400000).toISOString().slice(0, 10)
    const values = {
      title: `QA ${run} pending-only acceptance`,
      description: 'Temporary private QA fixture. Do not approve or publish this campaign.',
      categoryId: category.id, targetAudience: 'Internal QA only', startDate: start, endDate: end,
    }
    const created = await send('/api/campaigns', { method: 'POST', token: ownerToken, value: values })
    requireStatus(created, 201, 'Pending campaign submission')
    const campaign = created.body?.campaign
    requireCondition(Number.isSafeInteger(campaign?.id) && campaign.id > 0, 'Campaign submission did not return a valid ID.')
    fixtures.campaignId = campaign.id
    requireCondition(campaign.status === 'pending' && campaign.createdBy === fixtures.userIds[0] && campaign.type === 'cause' && campaign.businessId === null && campaign.imageUrl === null, 'Campaign submission did not preserve server-owned pending/community fields.')
    const own = await send(`/api/campaigns/mine/${campaign.id}`, { token: ownerToken })
    requireStatus(own, 200, 'Persisted owner detail')
    requireCondition(own.body?.id === campaign.id && own.body.status === 'pending' && own.body.title === values.title && own.body.createdBy === fixtures.userIds[0], 'Owner detail does not match the persisted QA campaign.')
    const mine = await send(`/api/campaigns/mine?status=pending&search=${run}&pageSize=100`, { token: ownerToken })
    requireStatus(mine, 200, 'Owner campaign list')
    requireCondition(Array.isArray(mine.body?.campaigns) && mine.body.campaigns.some(row => row.id === campaign.id) && mine.body.campaigns.every(row => row.createdBy === fixtures.userIds[0]), 'Owner list is missing the campaign or exposes another owner.')
    passed('Persisted pending text campaign and owner reads')

    const otherOwner = await send(`/api/campaigns/mine/${campaign.id}`, { token: otherToken })
    requireStatus(otherOwner, 404, 'Other-owner isolation', 'CAMPAIGN_NOT_FOUND')
    const guest = await send('/api/campaigns/mine')
    requireStatus(guest, 401, 'Guest protection', 'INVALID_TOKEN')
    const nonAdmin = await send('/api/campaigns/admin', { token: ownerToken })
    requireStatus(nonAdmin, 403, 'Non-admin protection', 'FORBIDDEN')
    const publicDetail = await send(`/api/campaigns/${campaign.id}`)
    requireStatus(publicDetail, 404, 'Pending campaign privacy', 'CAMPAIGN_NOT_FOUND')
    const publicList = await send(`/api/campaigns?pageSize=100&category=${category.id}&search=${run}`)
    requireStatus(publicList, 200, 'Public campaign list')
    requireCondition(Array.isArray(publicList.body?.campaigns) && !publicList.body.campaigns.some(row => row.id === campaign.id), 'The pending QA campaign appeared in the public list.')
    passed('Ownership, authorization and public privacy')

    const injected = await send('/api/campaigns', { method: 'POST', token: ownerToken, value: { ...values, createdBy: fixtures.userIds[1] } })
    requireStatus(injected, 422, 'Client-owned creator rejection', 'VALIDATION_FAILED')
    requireCondition(typeof injected.body.fieldErrors?.createdBy === 'string', 'Creator injection was not rejected on its field.')
    passed('Server-owned campaign creator')

    const logout = await send('/api/auth/logout', { method: 'PUT', token: ownerToken })
    requireStatus(logout, 204, 'Server logout')
    activeTokens.delete(ownerToken)
    const oldToken = await send('/api/campaigns/mine', { token: ownerToken })
    requireStatus(oldToken, 401, 'Logged-out token rejection', 'INVALID_TOKEN')
    const repeatedLogout = await send('/api/auth/logout', { method: 'PUT', token: ownerToken })
    requireStatus(repeatedLogout, 401, 'Repeated logout')
    // The legacy logout guard returns {error}; core campaign guards use {code}.
    requireCondition(typeof repeatedLogout.body?.error === 'string', 'Repeated logout did not return its documented legacy rejection.')
    passed('Logout invalidation')
  } catch (error) {
    failure = error instanceof AcceptanceError ? error : new AcceptanceError('Acceptance checks failed unexpectedly. Credentials were not logged.')
  } finally {
    for (const token of activeTokens) {
      try {
        const ended = await send('/api/auth/logout', { method: 'PUT', token })
        requireCondition([204, 401].includes(ended.status), `Could not confirm QA session cleanup (HTTP ${ended.status}).`)
        passed('Remaining QA session revoked')
      } catch {
        failure ||= new AcceptanceError('Could not confirm every QA server session ended. Use the fixture receipt for controlled follow-up.')
      }
    }
    emit(`QA fixture receipt: ${JSON.stringify(fixtures)}`)
    emit('This script sent no approval/publication/deletion requests. Use the receipt for controlled admin readback/cleanup of any created QA fixtures.')
  }
  if (failure) { failure.fixtures = fixtures; throw failure }
  return { checks, fixtures }
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2))
    console.log(`Target: ${options.origin}`)
    if (!options.allowQaWrites) {
      console.log('Plan only: no network requests or writes were made.')
      acceptancePlan.forEach(step => console.log(`- ${step}`))
      console.log('Run again with --allow-qa-writes only after approving this exact target and temporary QA records.')
      return
    }
    const result = await runLiveAcceptance(options)
    console.log(`Core HTTP acceptance passed: ${result.checks} checks. Browser/admin journeys and unfinished APIs are not certified by this script.`)
  } catch (error) {
    console.error(error instanceof AcceptanceError ? error.message : 'Acceptance checks failed unexpectedly. No private error details were logged.')
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
