#!/usr/bin/env node
// Explicitly opt-in: temporarily publishes only this run's clearly marked QA campaign.
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const productionOrigin = 'https://52.62.2.87'
export const acceptancePlan = [
  'Verify the exact approved live commit before sending any write.',
  'Log in the existing administrator using environment-only credentials; register two synthetic community accounts.',
  'Upload one tiny generated photo and check pending owner/admin access and public denial.',
  'Temporarily approve the clearly labelled QA campaign; check public fields, photo, participation and withdrawal.',
  'Edit/resubmit, reject a stale version, inspect review history, reapprove and unpublish only that QA campaign.',
  'Suspend/reactivate only the synthetic participant and verify session revocation.',
  'Soft-delete the QA campaign and log out every session created by this run. Synthetic accounts and audit/history records remain.',
  'Read the business-profile route without creating a business or changing any real account.',
]
export class AcceptanceError extends Error {
  constructor(message) { super(message); this.name = 'AcceptanceError' }
}
const ensure = (condition, message) => { if (!condition) throw new AcceptanceError(message) }
const validId = id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647
const version = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value

export function parseOptions(args = []) {
  let origin = productionOrigin
  let allowQaWrites = false
  let expectedCommit
  const flags = [...args]
  if (flags[0] && !flags[0].startsWith('--')) origin = flags.shift()
  let url
  try { url = new URL(origin) } catch { throw new AcceptanceError('Use the approved application origin.') }
  const loopback = url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)
  ensure((url.origin === productionOrigin || loopback) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Only the pinned production origin or HTTP loopback is permitted.')
  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] === '--allow-qa-writes' && !allowQaWrites) allowQaWrites = true
    else if (flags[index] === '--expected-commit' && expectedCommit === undefined) {
      expectedCommit = flags[++index]
      ensure(/^[a-f0-9]{40}$/.test(expectedCommit || ''), 'Expected commit must be a complete lowercase Git SHA.')
    } else throw new AcceptanceError('Only --allow-qa-writes and --expected-commit are accepted.')
  }
  ensure(!allowQaWrites || expectedCommit, 'QA writes require --expected-commit with the approved full SHA.')
  return { origin: url.origin, allowQaWrites, expectedCommit }
}

async function samplePhoto() {
  // Local dependency only. No private files or external photo sources are read.
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  return require('sharp')({ create: { width: 2, height: 2, channels: 3, background: '#16703d' } }).png().toBuffer()
}

export async function runAdditionalAcceptance({
  origin = productionOrigin, allowQaWrites = false, expectedCommit,
  env = process.env, fetchImpl = fetch, emit = console.log, clock = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), imageFactory = samplePhoto,
} = {}) {
  const options = parseOptions([origin, ...(allowQaWrites ? ['--allow-qa-writes'] : []), ...(expectedCommit ? ['--expected-commit', expectedCommit] : [])])
  ensure(options.allowQaWrites, 'QA writes were not approved. No requests were sent.')
  const adminEmail = env.CAUSECONNECT_QA_ADMIN_EMAIL
  const adminPassword = env.CAUSECONNECT_QA_ADMIN_PASSWORD
  ensure(typeof adminEmail === 'string' && adminEmail.trim() && typeof adminPassword === 'string' && adminPassword, 'Set CAUSECONNECT_QA_ADMIN_EMAIL and CAUSECONNECT_QA_ADMIN_PASSWORD in this process environment. No requests were sent.')
  const run = randomBytes(10).toString('hex')
  const prefix = `QA ${run}`
  const accounts = ['owner', 'participant'].map(label => ({ name: `${prefix} ${label}`, email: `qa-${run}-${label}@example.test`, password: randomBytes(32).toString('base64url'), accountType: 'user' }))
  const fixtures = { run, userIds: [], campaignId: null, campaignDeleted: false, uncertainWrites: [], remaining: [] }
  const tokens = new Set()
  const authTimes = new Map()
  let ownerToken, participantToken, adminToken, adminId, suspensionAttempted = false, reactivationUncertain = false, deletionUncertain = false
  let checks = 0, failure
  const passed = label => { checks += 1; emit(`PASS ${label}`) }
  const status = (result, expected, label, code) => {
    ensure(result.status === expected, `${label} failed (HTTP ${result.status}; expected ${expected}).`)
    if (code) ensure(result.body?.code === code, `${label} returned an unexpected error code.`)
    return result.body
  }
  async function send(route, { method = 'GET', token, value, form, bytes = false, label = 'API check' } = {}) {
    // A response-supplied photo URL must never move credentials or requests off-origin.
    const target = new URL(route, options.origin)
    ensure(target.origin === options.origin && !target.username && !target.password && !target.hash, 'A response contained an unsafe request URL.')
    const gap = target.pathname === '/api/auth/register' ? 13000 : target.pathname === '/api/auth/login' ? 6500 : 0
    if (gap && method === 'POST') {
      const previous = authTimes.get(target.pathname)
      if (previous !== undefined && gap > clock() - previous) await sleep(gap - (clock() - previous))
      authTimes.set(target.pathname, clock())
    }
    let response
    const uncertain = () => { if (method !== 'GET') fixtures.uncertainWrites.push(label) }
    try {
      response = await fetchImpl(target.href, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(value !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(value !== undefined ? { body: JSON.stringify(value) } : form ? { body: form } : {}),
      })
    } catch {
      uncertain()
      throw new AcceptanceError(`${label} could not be confirmed. No automatic retry was made.`)
    }
    if (response.status >= 500) uncertain()
    if (bytes) return { status: response.status, contentType: response.headers.get('content-type') || '', bytes: new Uint8Array(await response.arrayBuffer()) }
    if (response.status === 204) return { status: 204, body: null }
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
      uncertain(); throw new AcceptanceError(`${label} did not return JSON. No automatic retry was made.`)
    }
    try { return { status: response.status, body: await response.json() } }
    catch { uncertain(); throw new AcceptanceError(`${label} returned unreadable JSON. No automatic retry was made.`) }
  }
  async function login(values, expectedRole, expectedId) {
    const body = status(await send('/api/auth/login', { method: 'POST', value: { email: values.email, password: values.password }, label: 'Login' }), 200, 'Login')
    if (typeof body?.token === 'string' && body.token) tokens.add(body.token)
    ensure(validId(body?.user?.id) && body.user.role === expectedRole && (!expectedId || body.user.id === expectedId) && typeof body.token === 'string' && body.token, 'Login returned an unexpected account or session.')
    return body
  }
  async function owned() {
    const body = status(await send(`/api/campaigns/mine/${fixtures.campaignId}`, { token: ownerToken, label: 'Own QA campaign readback' }), 200, 'Own QA campaign readback')
    ensure(body.id === fixtures.campaignId && body.createdBy === fixtures.userIds[0] && typeof body.title === 'string' && body.title.startsWith(`${prefix} `) && version(body.updatedAt), 'Refusing to change a campaign outside the scoped QA fixture.')
    return body
  }
  async function fixtureUser() {
    const body = status(await send(`/api/admin/users?search=${encodeURIComponent(accounts[1].email)}&pageSize=100`, { token: adminToken, label: 'Synthetic account readback' }), 200, 'Synthetic account readback')
    ensure(Array.isArray(body.users) && Number.isSafeInteger(body.total), 'Admin users did not return a paginated result.')
    ensure(body.users.every(row => Object.keys(row).every(key => ['id', 'name', 'email', 'role', 'status', 'createdAt'].includes(key))), 'Admin account data exposed an undocumented private field.')
    const user = body.users.find(row => row.id === fixtures.userIds[1])
    ensure(user && user.email === accounts[1].email && user.name === accounts[1].name && user.role === 'public' && user.id !== adminId, 'Refusing to change a non-fixture account.')
    return user
  }
  async function approve(campaign) {
    return status(await send(`/api/campaigns/admin/${campaign.id}/status`, { method: 'PATCH', token: adminToken, value: { status: 'approved', comments: `${prefix} automated acceptance only`, expectedUpdatedAt: campaign.updatedAt }, label: 'QA approval' }), 200, 'QA approval')
  }
  async function removeFixture() {
    if (!fixtures.campaignId || fixtures.campaignDeleted || !ownerToken || deletionUncertain) return
    const result = await send(`/api/campaigns/mine/${fixtures.campaignId}`, { token: ownerToken, label: 'Cleanup campaign readback' })
    if (result.status === 404) { fixtures.campaignDeleted = true; return }
    status(result, 200, 'Cleanup campaign readback')
    const campaign = result.body
    ensure(campaign.id === fixtures.campaignId && campaign.createdBy === fixtures.userIds[0] && campaign.title?.startsWith(`${prefix} `) && version(campaign.updatedAt), 'Cleanup refused an unexpected campaign.')
    deletionUncertain = true // Never resend an unconfirmed deletion.
    status(await send(`/api/campaigns/mine/${campaign.id}`, { method: 'DELETE', token: ownerToken, value: { expectedUpdatedAt: campaign.updatedAt }, label: 'QA campaign soft-delete' }), 204, 'QA campaign soft-delete')
    fixtures.campaignDeleted = true
    deletionUncertain = false
  }
  try {
    const release = status(await send('/release.json', { label: 'Release verification' }), 200, 'Release verification')
    ensure(release.application === 'CauseConnect' && release.mode === 'live' && release.commit === options.expectedCommit, 'The served live commit does not match the approved release. No writes were sent.')
    passed('Exact live release')
    const photo = await imageFactory()
    ensure(photo instanceof Uint8Array && photo.length > 0 && photo.length < 10000, 'The generated QA image is invalid.')
    const admin = await login({ email: adminEmail, password: adminPassword }, 'admin')
    adminToken = admin.token; adminId = admin.user.id
    const categories = status(await send('/api/campaigns/categories'), 200, 'Category lookup')
    const category = categories.categories?.find(row => validId(row.id))
    ensure(category, 'No usable category is available.')
    for (const account of accounts) {
      const result = status(await send('/api/auth/register', { method: 'POST', value: account, label: 'Synthetic registration' }), 201, 'Synthetic registration')
      ensure(validId(result.user?.id) && result.user.role === 'public' && result.user.id !== adminId && !fixtures.userIds.includes(result.user.id), 'Registration did not return a distinct synthetic public account.')
      fixtures.userIds.push(result.user.id)
    }
    ownerToken = (await login(accounts[0], 'public', fixtures.userIds[0])).token
    participantToken = (await login(accounts[1], 'public', fixtures.userIds[1])).token
    passed('Synthetic accounts and real administrator session')

    const form = new FormData()
    form.append('file', new Blob([photo], { type: 'image/png' }), 'qa-generated.png')
    const upload = status(await send('/api/campaign-images', { method: 'POST', token: ownerToken, form, label: 'QA photo upload' }), 201, 'QA photo upload')
    ensure(/^img_[a-f0-9]{48}$/.test(upload.imageId || ''), 'Photo upload returned an invalid reference.')
    const fields = { title: `${prefix} temporary acceptance campaign`, description: 'Automated QA fixture; briefly published for acceptance, then soft-deleted. Not a real campaign.', categoryId: category.id, targetAudience: 'QA only', startDate: new Date(clock() + 86400000).toISOString().slice(0, 10), endDate: new Date(clock() + 2 * 86400000).toISOString().slice(0, 10) }
    const created = status(await send('/api/campaigns', { method: 'POST', token: ownerToken, value: { ...fields, imageId: upload.imageId }, label: 'QA campaign creation' }), 201, 'QA campaign creation')
    ensure(validId(created.campaign?.id), 'Campaign creation returned no valid fixture ID.')
    fixtures.campaignId = created.campaign.id
    let campaign = await owned()
    ensure(campaign.status === 'pending', 'New QA campaign was not pending.')
    const adminView = status(await send(`/api/campaigns/admin/${campaign.id}`, { token: adminToken }), 200, 'Admin private campaign')
    const stablePhoto = `/api/campaign-images/${upload.imageId}/content`
    for (const privateView of [campaign, adminView]) {
      ensure(typeof privateView.imageUrl === 'string' && new URL(privateView.imageUrl, options.origin).pathname === stablePhoto && new URL(privateView.imageUrl, options.origin).searchParams.has('ticket'), 'Private photo did not have its scoped signed URL.')
      const image = await send(privateView.imageUrl, { bytes: true, label: 'Private QA photo' })
      status(image, 200, 'Private QA photo')
      ensure(image.contentType.startsWith('image/png') && image.bytes.length > 0, 'Private QA photo bytes were unavailable.')
    }
    status(await send(stablePhoto, { bytes: true, label: 'Pending photo privacy' }), 404, 'Pending photo privacy')
    status(await send(`/api/campaigns/mine/${campaign.id}`, { token: participantToken }), 404, 'Other-owner privacy')
    passed('Photo-backed pending campaign and private image isolation')

    const approved = await approve(campaign)
    ensure(approved.campaign?.status === 'approved' && version(approved.campaign.updatedAt), 'Approval returned an invalid version.')
    const publicView = status(await send(`/api/campaigns/${campaign.id}`), 200, 'Approved public campaign')
    ensure(publicView.type === 'cause' && publicView.startDate === fields.startDate && publicView.endDate === fields.endDate && publicView.imageUrl === stablePhoto && !Object.hasOwn(publicView, 'review'), 'Public campaign fields or privacy are incorrect.')
    const listing = status(await send(`/api/campaigns?search=${run}&pageSize=20`), 200, 'Public paginated campaign list')
    ensure(listing.total === 1 && listing.page === 1 && listing.pageSize === 20 && listing.campaigns?.length === 1 && listing.campaigns[0].id === campaign.id, 'Public campaign pagination did not contain only the scoped fixture.')
    status(await send(stablePhoto, { bytes: true, label: 'Approved public photo' }), 200, 'Approved public photo')
    passed('Approval, public data and public photo')
    for (const state of ['joined', 'withdrawn']) {
      const joined = status(await send(`/api/campaigns/${campaign.id}/participation`, { method: 'PUT', token: participantToken, value: { status: state }, label: 'QA participation' }), 200, 'QA participation')
      ensure(joined.participation?.campaignId === campaign.id && joined.participation.status === state, 'Participation receipt is incorrect.')
    }
    const participation = status(await send('/api/participations/mine', { token: participantToken }), 200, 'Participation history')
    ensure(participation.participations?.some(row => row.campaignId === campaign.id && row.status === 'withdrawn'), 'Withdrawal did not persist.')
    passed('Join, withdraw and participant history')

    campaign = await owned()
    const stale = campaign.updatedAt
    const edited = status(await send(`/api/campaigns/mine/${campaign.id}`, { method: 'PATCH', token: ownerToken, value: { ...fields, title: `${prefix} edited acceptance campaign`, expectedUpdatedAt: stale }, label: 'QA owner edit' }), 200, 'QA owner edit')
    ensure(edited.campaign?.status === 'pending' && version(edited.campaign.updatedAt) && edited.campaign.updatedAt !== stale, 'Owner edit did not resubmit with a fresh version.')
    status(await send(`/api/campaigns/admin/${campaign.id}/status`, { method: 'PATCH', token: adminToken, value: { status: 'approved', expectedUpdatedAt: stale }, label: 'Stale QA approval' }), 409, 'Stale QA approval', 'CAMPAIGN_CHANGED')
    status(await send(`/api/campaigns/${campaign.id}`), 404, 'Resubmission public privacy')
    status(await send(stablePhoto, { bytes: true, label: 'Resubmission photo privacy' }), 404, 'Resubmission photo privacy')
    const history = status(await send(`/api/campaigns/admin/${campaign.id}/reviews`, { token: adminToken }), 200, 'Persisted review history')
    ensure(history.total === 1 && history.reviews?.[0]?.action === 'approved', 'Earlier review history was not retained.')
    await approve(await owned())
    campaign = await owned()
    const unpublished = status(await send(`/api/campaigns/admin/${campaign.id}/publication`, { method: 'PATCH', token: adminToken, value: { status: 'pending', reason: `${prefix} acceptance complete`, expectedUpdatedAt: campaign.updatedAt }, label: 'QA unpublish' }), 200, 'QA unpublish')
    ensure(unpublished.campaign?.status === 'pending', 'Unpublish did not restore pending status.')
    status(await send(stablePhoto, { bytes: true, label: 'Unpublished photo privacy' }), 404, 'Unpublished photo privacy')
    passed('Edit/version conflict, review history and reversible unpublish')

    await fixtureUser()
    suspensionAttempted = true
    status(await send(`/api/admin/users/${fixtures.userIds[1]}/status`, { method: 'PATCH', token: adminToken, value: { status: 'suspended' }, label: 'Suspend synthetic participant' }), 200, 'Suspend synthetic participant')
    status(await send('/api/participations/mine', { token: participantToken }), 401, 'Suspended session invalidation')
    status(await send('/api/auth/login', { method: 'POST', value: { email: accounts[1].email, password: accounts[1].password }, label: 'Suspended login rejection' }), 403, 'Suspended login rejection', 'ACCOUNT_SUSPENDED')
    ensure((await fixtureUser()).status === 'suspended', 'Synthetic account suspension did not persist.')
    reactivationUncertain = true
    status(await send(`/api/admin/users/${fixtures.userIds[1]}/status`, { method: 'PATCH', token: adminToken, value: { status: 'active' }, label: 'Reactivate synthetic participant' }), 200, 'Reactivate synthetic participant')
    reactivationUncertain = false; suspensionAttempted = false
    status(await send('/api/participations/mine', { token: participantToken }), 401, 'Old session remains revoked')
    participantToken = (await login(accounts[1], 'public', fixtures.userIds[1])).token
    status(await send('/api/participations/mine', { token: participantToken }), 200, 'Fresh session after reactivation')
    passed('Safe account listing, suspension and fresh-session reactivation')
    const profile = await send('/api/business/me', { token: ownerToken, label: 'Business profile availability' })
    if (profile.status === 404) { fixtures.remaining.push('Kim business profile API'); emit('REMAINING Business profile API returned 404; no business data was created.') }
    else emit('NOTE Business profile route responded; business onboarding was not exercised by this community-account run.')
    await removeFixture()
    status(await send(`/api/campaigns/${fixtures.campaignId}`), 404, 'Deleted public campaign')
    status(await send(stablePhoto, { bytes: true, label: 'Deleted photo privacy' }), 404, 'Deleted photo privacy')
    passed('Scoped campaign soft-delete')
  } catch (error) {
    failure = error instanceof AcceptanceError ? error : new AcceptanceError('Additional acceptance failed unexpectedly. Private error details were not logged.')
  } finally {
    try { await removeFixture() } catch { failure ||= new AcceptanceError('QA campaign cleanup could not be confirmed. Use the non-secret fixture receipt for follow-up.') }
    if (suspensionAttempted && !reactivationUncertain && adminToken && fixtures.userIds[1]) {
      try {
        const user = await fixtureUser()
        if (user.status === 'suspended') {
          reactivationUncertain = true
          status(await send(`/api/admin/users/${user.id}/status`, { method: 'PATCH', token: adminToken, value: { status: 'active' }, label: 'Cleanup synthetic reactivation' }), 200, 'Cleanup synthetic reactivation')
          reactivationUncertain = false
        }
      } catch { failure ||= new AcceptanceError('Synthetic account reactivation could not be confirmed.') }
    }
    for (const token of tokens) {
      try { ensure([204, 401].includes((await send('/api/auth/logout', { method: 'PUT', token, label: 'Session cleanup' })).status), 'Session cleanup failed.') }
      catch { failure ||= new AcceptanceError('Could not confirm every session created by this run ended.') }
    }
    emit(`QA fixture receipt: ${JSON.stringify(fixtures)}`)
    emit('Only this run’s synthetic accounts/campaign were changed. Account, participation and audit/history rows are retained; no SQL cleanup or hard deletion was attempted.')
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
      console.log('Live execution requires --allow-qa-writes --expected-commit FULL_SHA and environment-only admin credentials.')
      return
    }
    const result = await runAdditionalAcceptance(options)
    console.log(`Additional HTTP acceptance passed: ${result.checks} checks. Browser acceptance and the remaining business-profile flow are separate.`)
  } catch (error) {
    console.error(error instanceof AcceptanceError ? error.message : 'Acceptance failed unexpectedly. No private error details were logged.')
    process.exitCode = 1
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
