#!/usr/bin/env node
// Opt-in only: publishes and then soft-deletes this run's labelled QA business campaign.
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AcceptanceError, parseOptions, productionOrigin } from './acceptance-additional.mjs'

export { AcceptanceError, parseOptions, productionOrigin }
export const acceptancePlan = [
  'Verify the exact approved live commit before any write.',
  'Use environment-only administrator credentials; register two synthetic business owners and one public enquirer.',
  'Check fresh null profiles, save/read normalized QA profiles and deny guest/public profile access.',
  'Create a photo-backed business campaign through canonical POST /api/campaigns; verify pending photo and owner isolation.',
  'Temporarily approve only the labelled QA fixture; check public business fields and generated photo.',
  'Send one synthetic enquiry; verify the linked owner inbox and another business owner isolation.',
  'Unpublish and soft-delete only this run’s campaign; retain profiles, enquiries, accounts and audit/history rows.',
  'Log out every session created by this run and verify revoked access. No SQL cleanup or hard deletion.',
]

const ensure = (condition, message) => { if (!condition) throw new AcceptanceError(message) }
const validId = id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647
const validVersion = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value

async function samplePhoto() {
  const require = createRequire(new URL('../../backend/package.json', import.meta.url))
  return require('sharp')({ create: { width: 2, height: 2, channels: 3, background: '#17643b' } }).png().toBuffer()
}

export async function runBusinessAcceptance({
  origin = productionOrigin, allowQaWrites = false, expectedCommit,
  preferredCategoryId,
  env = process.env, fetchImpl = fetch, emit = console.log, clock = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), imageFactory = samplePhoto,
} = {}) {
  const options = parseOptions([origin, ...(allowQaWrites ? ['--allow-qa-writes'] : []), ...(expectedCommit ? ['--expected-commit', expectedCommit] : [])])
  ensure(options.allowQaWrites, 'QA writes were not approved. No requests were sent.')
  ensure(preferredCategoryId === undefined || validId(preferredCategoryId), 'An imported preferred category must be a positive JSON integer. No requests were sent.')
  const adminEmail = env.CAUSECONNECT_QA_ADMIN_EMAIL
  const adminPassword = env.CAUSECONNECT_QA_ADMIN_PASSWORD
  ensure(typeof adminEmail === 'string' && adminEmail.trim() && typeof adminPassword === 'string' && adminPassword,
    'Set CAUSECONNECT_QA_ADMIN_EMAIL and CAUSECONNECT_QA_ADMIN_PASSWORD in this process environment. No requests were sent.')
  const run = randomBytes(10).toString('hex'), prefix = `QA ${run}`
  const accounts = [['owner', 'business'], ['enquirer', 'user'], ['other-owner', 'business']].map(([label, accountType]) => ({
    name: `${prefix} ${label}`, email: `qa-${run}-${label}@example.test`, password: randomBytes(32).toString('base64url'), accountType,
  }))
  const fixtures = { run, userIds: [], businessIds: [], campaignId: null, enquiryId: null, campaignDeleted: false, uncertainWrites: [] }
  const tokens = new Set(), authTimes = new Map()
  let adminToken, adminId, ownerToken, enquirerToken, otherToken, campaignFields, stablePhoto, deletionAttempted = false
  let checks = 0, failure
  const passed = label => { checks += 1; emit(`PASS ${label}`) }
  const status = (response, expected, label, code) => {
    ensure(response.status === expected, `${label} failed (HTTP ${response.status}; expected ${expected}).`)
    if (code) ensure(response.body?.code === code, `${label} returned an unexpected error code.`)
    return response.body
  }
  async function send(route, { method = 'GET', token, value, form, bytes = false, label = 'API check' } = {}) {
    let target
    try { target = new URL(route, options.origin) } catch { throw new AcceptanceError('A response contained an unsafe request URL.') }
    ensure(target.origin === options.origin && !target.username && !target.password && !target.hash, 'A response contained an unsafe request URL.')
    const gap = target.pathname === '/api/auth/register' ? 13000 : target.pathname === '/api/auth/login' ? 6500 : 0
    if (gap && method === 'POST') {
      const previous = authTimes.get(target.pathname)
      if (previous !== undefined && gap > clock() - previous) await sleep(gap - (clock() - previous))
      authTimes.set(target.pathname, clock())
    }
    const uncertain = () => { if (method !== 'GET') fixtures.uncertainWrites.push(label) }
    let response
    try {
      response = await fetchImpl(target.href, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(value !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(value !== undefined ? { body: JSON.stringify(value) } : form ? { body: form } : {}),
      })
    } catch {
      uncertain(); throw new AcceptanceError(`${label} could not be confirmed. No automatic retry was made.`)
    }
    if (response.status >= 500) uncertain()
    if (bytes) {
      try { return { status: response.status, contentType: response.headers.get('content-type') || '', bytes: new Uint8Array(await response.arrayBuffer()) } }
      catch { throw new AcceptanceError(`${label} photo read could not be confirmed.`) }
    }
    if (response.status === 204) return { status: 204, body: null }
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
      uncertain(); throw new AcceptanceError(`${label} did not return JSON. No automatic retry was made.`)
    }
    try { return { status: response.status, body: await response.json() } }
    catch { uncertain(); throw new AcceptanceError(`${label} returned unreadable JSON. No automatic retry was made.`) }
  }
  async function login(values, role, expectedId) {
    const body = status(await send('/api/auth/login', { method: 'POST', value: { email: values.email, password: values.password }, label: 'Login' }), 200, 'Login')
    if (typeof body?.token === 'string' && body.token) tokens.add(body.token)
    ensure(validId(body?.user?.id) && body.user.role === role && (!expectedId || body.user.id === expectedId)
      && typeof body.token === 'string' && body.token, 'Login returned an unexpected account or session.')
    return body
  }
  function scopedCampaign(campaign) {
    ensure(campaign?.id === fixtures.campaignId && campaign.createdBy === fixtures.userIds[0]
      && campaign.businessId === fixtures.businessIds[0] && campaign.type === 'business'
      && campaign.title === campaignFields?.title && validVersion(campaign.updatedAt), 'Refusing to change a campaign outside the scoped QA fixture.')
    return campaign
  }
  async function owned() {
    return scopedCampaign(status(await send(`/api/campaigns/mine/${fixtures.campaignId}`, { token: ownerToken, label: 'Own QA business campaign' }), 200, 'Own QA business campaign'))
  }
  function decisionReceipt(body, expectedStatus, previousVersion) {
    const campaign = body?.campaign
    ensure(campaign?.id === fixtures.campaignId && campaign.status === expectedStatus && validVersion(campaign.updatedAt)
      && Date.parse(campaign.updatedAt) > Date.parse(previousVersion), 'Decision did not return the scoped QA ID, status and fresh saved version.')
    return campaign
  }
  async function removeFixture() {
    if (!fixtures.campaignId || fixtures.campaignDeleted || !ownerToken || deletionAttempted) return
    const result = await send(`/api/campaigns/mine/${fixtures.campaignId}`, { token: ownerToken, label: 'Cleanup campaign readback' })
    if (result.status === 404) { fixtures.campaignDeleted = true; return }
    const campaign = scopedCampaign(status(result, 200, 'Cleanup campaign readback'))
    deletionAttempted = true // Even an unconfirmed delete is never repeated.
    status(await send(`/api/campaigns/mine/${campaign.id}`, { method: 'DELETE', token: ownerToken,
      value: { expectedUpdatedAt: campaign.updatedAt }, label: 'QA business campaign soft-delete' }), 204, 'QA business campaign soft-delete')
    fixtures.campaignDeleted = true
  }
  async function photoBytes(route, expected, label) {
    const result = await send(route, { bytes: true, label })
    status(result, expected, label)
    if (expected === 200) ensure(result.contentType.startsWith('image/png') && result.bytes.length > 0 && result.bytes.length < 10000, 'Generated QA photo bytes were unavailable or unexpected.')
  }
  function expectedProfile(profile, values) {
    ensure(validId(profile?.id) && profile.businessName === values.businessName.trim() && profile.abn === null
      && profile.website === values.website.trim() && profile.description === values.description.trim()
      && Object.keys(profile).every(key => ['id', 'businessName', 'abn', 'website', 'description'].includes(key)), 'Profile did not return the normalized safe contract shape.')
    return profile
  }
  async function inbox(token, label, extra = '') {
    const body = status(await send(`/api/business/me/enquiries?page=1&pageSize=10${extra}`, { token, label }), 200, label)
    ensure(Array.isArray(body.enquiries) && Number.isSafeInteger(body.total) && body.total >= 0 && body.page === 1 && body.pageSize === 10, 'Business inbox did not return the paginated contract.')
    return body
  }
  try {
    const release = status(await send('/release.json', { label: 'Release verification' }), 200, 'Release verification')
    ensure(release.application === 'CauseConnect' && release.mode === 'live' && release.commit === options.expectedCommit,
      'The served live commit does not match the approved release. No writes were sent.')
    passed('Exact live release')
    // Imported disposable-DB checks can select their owned category without
    // altering real API responses. The CLI has no category override flag.
    const categories = status(await send('/api/campaigns/categories'), 200, 'Category lookup')
    const category = categories.categories?.find(row => validId(row.id) && (preferredCategoryId === undefined || row.id === preferredCategoryId))
    ensure(category, 'No usable requested category is available. No writes were sent.')
    const photo = await imageFactory()
    ensure(photo instanceof Uint8Array && photo.length > 0 && photo.length < 10000, 'The generated QA image is invalid.')
    const admin = await login({ email: adminEmail, password: adminPassword }, 'admin')
    adminToken = admin.token; adminId = admin.user.id
    for (const account of accounts) {
      const registered = status(await send('/api/auth/register', { method: 'POST', value: account, label: 'Synthetic registration' }), 201, 'Synthetic registration')
      const role = account.accountType === 'business' ? 'business_owner' : 'public'
      ensure(validId(registered.user?.id) && registered.user.role === role && registered.user.id !== adminId
        && !fixtures.userIds.includes(registered.user.id), 'Registration did not return distinct scoped QA accounts.')
      fixtures.userIds.push(registered.user.id)
    }
    ownerToken = (await login(accounts[0], 'business_owner', fixtures.userIds[0])).token
    enquirerToken = (await login(accounts[1], 'public', fixtures.userIds[1])).token
    otherToken = (await login(accounts[2], 'business_owner', fixtures.userIds[2])).token
    passed('Generated business/public accounts and dedicated administrator session')

    const profiles = [
      { businessName: `  ${prefix} business  `, abn: '  ', website: ' https://example.com/causeconnect-qa ', description: ' Synthetic business acceptance fixture, not a real trading business. ' },
      { businessName: ` ${prefix} other business `, abn: '', website: ' https://example.com/causeconnect-other-qa ', description: ' Separate synthetic business for isolation checks only. ' },
    ]
    for (const [index, token] of [ownerToken, otherToken].entries()) {
      ensure(status(await send('/api/business/me', { token, label: 'Fresh business profile' }), 200, 'Fresh business profile').business === null, 'Freshly registered QA owner unexpectedly had a profile; refusing to overwrite it.')
      const saved = expectedProfile(status(await send('/api/business/me', { method: 'PUT', token, value: profiles[index], label: 'QA profile save' }), 200, 'QA profile save').business, profiles[index])
      ensure(!fixtures.businessIds.includes(saved.id), 'Profile save returned another fixture business ID.')
      fixtures.businessIds.push(saved.id)
      const read = expectedProfile(status(await send('/api/business/me', { token, label: 'Persisted QA profile' }), 200, 'Persisted QA profile').business, profiles[index])
      ensure(read.id === saved.id, 'Business profile did not persist its own ID.')
    }
    status(await send('/api/business/me', { label: 'Guest profile denial' }), 401, 'Guest profile denial')
    status(await send('/api/business/me', { token: enquirerToken, label: 'Public profile denial' }), 403, 'Public profile denial', 'FORBIDDEN')
    passed('Fresh profile create/read normalization and role isolation')

    const form = new FormData()
    form.append('file', new Blob([photo], { type: 'image/png' }), 'qa-business-generated.png')
    const upload = status(await send('/api/campaign-images', { method: 'POST', token: ownerToken, form, label: 'QA business photo upload' }), 201, 'QA business photo upload')
    ensure(/^img_[a-f0-9]{48}$/.test(upload.imageId || ''), 'Photo upload returned an invalid reference.')
    stablePhoto = `/api/campaign-images/${upload.imageId}/content`
    campaignFields = { title: `${prefix} temporary business acceptance`, description: 'Automated synthetic QA business campaign; briefly approved for acceptance, then unpublished and soft-deleted. Not a real offer.',
      categoryId: category.id, targetAudience: 'QA only', startDate: new Date(clock() + 86400000).toISOString().slice(0, 10), endDate: new Date(clock() + 2 * 86400000).toISOString().slice(0, 10) }
    const created = status(await send('/api/campaigns', { method: 'POST', token: ownerToken, value: { ...campaignFields, imageId: upload.imageId }, label: 'QA business campaign creation' }), 201, 'QA business campaign creation')
    ensure(validId(created.campaign?.id), 'Campaign creation returned no valid fixture ID.')
    fixtures.campaignId = created.campaign.id
    let campaign = await owned()
    ensure(campaign.status === 'pending', 'New QA business campaign was not pending.')
    const adminView = scopedCampaign(status(await send(`/api/campaigns/admin/${campaign.id}`, { token: adminToken, label: 'Admin private business campaign' }), 200, 'Admin private business campaign'))
    for (const view of [campaign, adminView]) {
      const url = typeof view.imageUrl === 'string' ? new URL(view.imageUrl, options.origin) : null
      ensure(url && url.origin === options.origin && !url.username && !url.password && !url.hash
        && url.pathname === stablePhoto && url.searchParams.has('ticket'), 'Private photo did not have its scoped signed URL.')
      await photoBytes(view.imageUrl, 200, 'Private business QA photo')
    }
    await photoBytes(stablePhoto, 404, 'Pending business photo privacy')
    status(await send(`/api/campaigns/${campaign.id}`, { label: 'Pending business public privacy' }), 404, 'Pending business public privacy')
    status(await send(`/api/campaigns/mine/${campaign.id}`, { token: otherToken, label: 'Other business owner campaign denial' }), 404, 'Other business owner campaign denial')
    passed('Canonical business posting, linked profile and pending photo isolation')

    const approved = status(await send(`/api/campaigns/admin/${campaign.id}/status`, { method: 'PATCH', token: adminToken,
      value: { status: 'approved', comments: `${prefix} synthetic business acceptance only`, expectedUpdatedAt: campaign.updatedAt }, label: 'QA business approval' }), 200, 'QA business approval')
    const approvalReceipt = decisionReceipt(approved, 'approved', campaign.updatedAt)
    campaign = await owned()
    ensure(campaign.status === 'approved' && campaign.updatedAt === approvalReceipt.updatedAt, 'Approved QA business campaign did not persist the decision receipt.')
    const publicView = status(await send(`/api/campaigns/${campaign.id}`, { label: 'Approved public business campaign' }), 200, 'Approved public business campaign')
    scopedCampaign(publicView)
    ensure(publicView.business?.id === fixtures.businessIds[0] && publicView.business.businessName === profiles[0].businessName.trim()
      && publicView.business.website === profiles[0].website.trim() && publicView.imageUrl === stablePhoto
      && publicView.startDate === campaignFields.startDate && publicView.endDate === campaignFields.endDate
      && !Object.hasOwn(publicView, 'review') && !Object.hasOwn(publicView, 'enquiries'), 'Public business fields or privacy are incorrect.')
    await photoBytes(stablePhoto, 200, 'Approved public business photo')
    passed('Scoped admin approval and public business/photo fields')

    const contact = { name: ` ${prefix} synthetic enquirer `, email: ` ${accounts[1].email.toUpperCase()} `, phone: '', message: ` ${prefix} acceptance enquiry only; no actual booking or purchase. ` }
    const enquiry = status(await send(`/api/campaigns/${campaign.id}/enquiries`, { method: 'POST', token: enquirerToken,
      value: contact, label: 'QA business enquiry' }), 201, 'QA business enquiry').enquiry
    ensure(validId(enquiry?.id) && enquiry.campaignId === campaign.id && enquiry.businessId === fixtures.businessIds[0]
      && enquiry.name === contact.name.trim() && enquiry.email === accounts[1].email && enquiry.phone === null
      && enquiry.message === contact.message.trim(), 'Enquiry receipt did not match the scoped normalized contact data.')
    fixtures.enquiryId = enquiry.id
    const ownInbox = await inbox(ownerToken, 'Owner business inbox')
    ensure(ownInbox.total === 1 && ownInbox.enquiries.length === 1 && ownInbox.enquiries[0].id === enquiry.id
      && ownInbox.enquiries[0].businessId === fixtures.businessIds[0] && ownInbox.enquiries[0].campaign?.id === campaign.id,
      'Linked business inbox did not contain exactly its persisted fixture enquiry.')
    const otherInbox = await inbox(otherToken, 'Other business inbox isolation', `&businessId=${fixtures.businessIds[0]}`)
    ensure(otherInbox.total === 0 && otherInbox.enquiries.length === 0, 'Another business owner could access the fixture enquiry.')
    status(await send('/api/business/me/enquiries', { token: enquirerToken, label: 'Public inbox denial' }), 403, 'Public inbox denial', 'FORBIDDEN')
    status(await send('/api/business/me/enquiries', { label: 'Guest inbox denial' }), 401, 'Guest inbox denial')
    passed('Persisted enquiry, linked owner inbox and cross-business privacy')

    campaign = await owned()
    const unpublished = status(await send(`/api/campaigns/admin/${campaign.id}/publication`, { method: 'PATCH', token: adminToken,
      value: { status: 'pending', reason: `${prefix} business acceptance complete`, expectedUpdatedAt: campaign.updatedAt }, label: 'QA business unpublish' }), 200, 'QA business unpublish')
    const unpublishReceipt = decisionReceipt(unpublished, 'pending', campaign.updatedAt)
    campaign = await owned()
    ensure(campaign.status === 'pending' && campaign.updatedAt === unpublishReceipt.updatedAt, 'Unpublish did not persist the scoped pending decision receipt.')
    status(await send(`/api/campaigns/${campaign.id}`, { label: 'Unpublished business privacy' }), 404, 'Unpublished business privacy')
    await photoBytes(stablePhoto, 404, 'Unpublished business photo privacy')
    const retained = await inbox(ownerToken, 'Retained private enquiry history')
    ensure(retained.total === 1 && retained.enquiries[0]?.id === enquiry.id && retained.enquiries[0].campaign === null, 'Enquiry history was lost or exposed unpublished campaign content.')
    await removeFixture()
    status(await send(`/api/campaigns/${fixtures.campaignId}`, { label: 'Deleted business public privacy' }), 404, 'Deleted business public privacy')
    await photoBytes(stablePhoto, 404, 'Deleted business photo privacy')
    const afterDelete = await inbox(ownerToken, 'Retained enquiry after soft deletion')
    ensure(afterDelete.total === 1 && afterDelete.enquiries[0]?.id === enquiry.id && afterDelete.enquiries[0].campaign === null, 'Soft deletion did not preserve safe enquiry history.')
    passed('Scoped unpublish/soft-delete and retained private enquiry history')
  } catch (error) {
    failure = error instanceof AcceptanceError ? error : new AcceptanceError('Business acceptance failed unexpectedly. Private error details were not logged.')
  } finally {
    try { await removeFixture() } catch { failure ||= new AcceptanceError('QA campaign cleanup could not be confirmed. Use the non-secret fixture receipt for follow-up.') }
    let sessionsConfirmed = true
    for (const token of tokens) {
      try {
        ensure([204, 401].includes((await send('/api/auth/logout', { method: 'PUT', token, label: 'Business session cleanup' })).status), 'Session cleanup failed.')
        status(await send('/api/campaigns/mine', { token, label: 'Revoked QA session check' }), 401, 'Revoked QA session check')
      } catch { sessionsConfirmed = false; failure ||= new AcceptanceError('Could not confirm every session created by this run ended.') }
    }
    if (sessionsConfirmed && tokens.size && !failure) passed('All created sessions revoked')
    emit(`QA business fixture receipt: ${JSON.stringify(fixtures)}`)
    emit('Only this run’s synthetic accounts/profiles/enquiry/campaign were written. Profiles, enquiries, accounts and audit/history rows remain; no SQL cleanup or hard deletion was attempted.')
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
      console.log('Execution requires --allow-qa-writes --expected-commit FULL_SHA and environment-only administrator credentials.')
      return
    }
    const result = await runBusinessAcceptance(options)
    console.log(`Business HTTP acceptance passed: ${result.checks} groups. Actual browser/manual/team acceptance remain separate.`)
  } catch (error) {
    console.error(error instanceof AcceptanceError ? error.message : 'Acceptance failed unexpectedly. No private error details were logged.')
    process.exitCode = 1
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
