import React from 'react'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { File as NativeFile } from 'node:buffer'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import RegistrationPage from '../src/pages/RegistrationPage.jsx'
import LoginPage from '../src/pages/LoginPage.jsx'
import LogoutPage from '../src/pages/LogoutPage.jsx'
import CreateCampaignPage from '../src/pages/CreateCampaignPage.jsx'
import BusinessProfilePage from '../src/pages/BusinessProfilePage.jsx'
import AdminCampaignReviewPage from '../src/pages/AdminCampaignReviewPage.jsx'
import MyParticipationPage from '../src/pages/MyParticipationPage.jsx'
import BusinessEnquiriesPage from '../src/pages/BusinessEnquiriesPage.jsx'
import CampaignParticipation from '../src/components/CampaignParticipation.jsx'
import CampaignEnquiryForm from '../src/components/CampaignEnquiryForm.jsx'
import { apiRequest, DEMO_MODE } from '../src/services/apiClient.js'
import { getSession, storeSession } from '../src/services/authSession.js'
import { loadCampaignCategories, submitCampaign } from '../src/services/campaignSubmissionService.js'
import { listCampaigns, getCampaignById } from '../src/services/campaignService.js'
import { loadParticipation, setParticipation, loadMyParticipation, sendCampaignEnquiry, loadBusinessEnquiries } from '../src/services/engagementService.js'
import { loadBusinessProfile, saveBusinessProfile } from '../src/services/businessService.js'
import { loadOwnedCampaign, saveOwnedCampaign, deleteOwnedCampaign } from '../src/services/ownedCampaignService.js'
import { loadAdminCampaign, reviewCampaign, loadCampaignReviews, unpublishCampaign, deleteCampaign } from '../src/services/campaignManagementService.js'
import { loadAdminUsers, changeUserStatus } from '../src/services/adminUserService.js'

// Native fetch is deliberately untouched. These requests reach the real Express app.
const require = createRequire(path.resolve(process.cwd(), '../backend/package.json'))
const db = require('./src/database/models')
const bcrypt = require('bcrypt')
const sharp = require('sharp')
const frontendRequire = createRequire(path.resolve(process.cwd(), 'package.json'))
const { FormData: NativeFormData } = frontendRequire('undici')
const originalFormData = globalThis.FormData
const apiOrigin = new URL(import.meta.env.VITE_API_BASE_URL).origin
db.sequelize.options.logging = false
const tag = process.env.CAUSECONNECT_TEST_RUN
const password = `LocalOnly-${randomBytes(16).toString('hex')}`
const email = `frontend-${tag}@example.test`
let category
let approved
let user
let token
let submitted
let admin

function change(label, value) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
function registerForm(value = email) {
  change('Name', 'Frontend integration')
  change('Email', value)
  change('Password', password)
  change('Confirm password', password)
}
const payload = () => ({ title: `HTTP campaign ${tag}`, description: 'Created through the actual frontend and persisted in MySQL.', categoryId: category.categoryId, startDate: '2028-10-01', endDate: '2028-10-02' })

beforeAll(async () => {
  expect(DEMO_MODE).toBe(false)
  // Use real multipart serialization with native fetch. jsdom's File/FormData
  // are DOM objects, not streamable Node fetch bodies; no request is mocked.
  globalThis.FormData = NativeFormData
  await db.sequelize.authenticate()
  category = await db.Category.create({ categoryName: `Integration ${tag}` })
  admin = await db.User.create({ fullName: 'Test admin', email: `admin-${tag}@example.test`, passwordHash: await bcrypt.hash(password, 10), role: 'admin', status: 'active' })
  approved = await db.Campaign.create({ title: `Approved ${tag}`, description: 'Existing approved record.', categoryId: category.categoryId, createdBy: admin.userId, status: 'approved' })
})
afterEach(() => { cleanup(); localStorage.clear() })
afterAll(async () => { globalThis.FormData = originalFormData; await db.sequelize.close() })

describe.sequential('frontend → real Express → disposable MySQL', () => {
  it('rejects a short signup password on the page without creating a database row', async () => {
    const shortEmail = `short-frontend-${tag}@example.test`
    render(<RegistrationPage />)
    registerForm(shortEmail)
    change('Password', 'short')
    change('Confirm password', 'short')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByText('Use at least 6 characters. A longer passphrase is easier to remember.')).toBeTruthy()
    expect(screen.queryByText(/Registration successful/)).toBeNull()
    expect(await db.User.count({ where: { email: shortEmail } })).toBe(0)
  })

  it('accepts an exact six-character signup through the page and stores a verified hash', async () => {
    const minimumEmail = `minimum-frontend-${tag}@example.test`
    render(<RegistrationPage />)
    registerForm(minimumEmail)
    change('Password', 'abc123')
    change('Confirm password', 'abc123')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Registration successful'))
    const minimumUser = await db.User.scope('withPassword').findOne({ where: { email: minimumEmail } })
    expect(minimumUser.role).toBe('public')
    expect(minimumUser.passwordHash).not.toBe('abc123')
    expect(await bcrypt.compare('abc123', minimumUser.passwordHash)).toBe(true)
  })

  it('registers through the actual page and stores a hashed password with public role', async () => {
    render(<RegistrationPage />)
    registerForm()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Registration successful'))
    user = await db.User.scope('withPassword').findOne({ where: { email } })
    expect(user.role).toBe('public')
    expect(user.passwordHash).not.toBe(password)
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true)
  })

  it('renders real duplicate-email rejection without creating another row', async () => {
    render(<RegistrationPage />)
    registerForm()
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Unable to create your account')
    expect(screen.getByText(/Email has already been registered/)).toBeTruthy()
    expect(await db.User.count({ where: { email } })).toBe(1)
  })

  it('rejects wrong credentials through the login page without saving a local session', async () => {
    render(<LoginPage />)
    change('Email', email)
    change('Password', 'Deliberately-wrong')
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Email or password is incorrect')
    expect(getSession().token).toBeNull()
  })

  it('logs in through the page and saves the real server session', async () => {
    render(<LoginPage />)
    change('Email', email)
    change('Password', password)
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    await waitFor(() => expect(getSession().token).toBeTruthy())
    token = getSession().token
    expect(getSession().user).toMatchObject({ id: user.userId, role: 'public' })
    const session = await db.UserSession.findOne({ where: { token } })
    expect(session.status).toBe('active')
    expect(session.userAgent).toBeTruthy()
    // jsdom cannot perform LoginPage's document navigation. Browser redirect is covered separately.
  })

  it('loads real categories and public list/detail using frontend response parsing', async () => {
    expect(await loadCampaignCategories()).toContainEqual({ id: category.categoryId, name: category.categoryName })
    const list = await listCampaigns({ category: category.categoryId, pageSize: 20 })
    expect(list.items.map(item => item.id)).toContain(String(approved.campaignId))
    expect((await getCampaignById(approved.campaignId)).campaign.title).toBe(approved.title)
  })

  it('submits from the actual campaign page, persists pending status and keeps it private', async () => {
    storeSession(token, { id: user.userId, role: 'public', name: 'Frontend integration' })
    render(<CreateCampaignPage />)
    await screen.findByRole('option', { name: category.categoryName })
    const value = payload()
    change('Campaign title', value.title)
    change('Description', value.description)
    change('Category', String(value.categoryId))
    change('Start date', value.startDate)
    change('End date', value.endDate)
    fireEvent.click(screen.getByRole('button', { name: 'Submit campaign for review' }))
    expect(await screen.findByRole('heading', { name: 'Campaign submitted' })).toBeTruthy()
    submitted = await db.Campaign.findOne({ where: { title: value.title } })
    expect(submitted).toMatchObject({ status: 'pending', createdBy: user.userId, categoryId: category.categoryId, imageUrl: null })
    const list = await listCampaigns({ category: category.categoryId, pageSize: 20 })
    expect(list.items.map(item => item.id)).not.toContain(String(submitted.campaignId))
    await expect(getCampaignById(submitted.campaignId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('can read pending data through the existing authenticated admin endpoint only', async () => {
    const endpoint = `/api/campaigns/admin/${submitted.campaignId}`
    await expect(apiRequest(endpoint)).rejects.toMatchObject({ status: 401 })
    await expect(apiRequest(endpoint, { token })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
    const login = await apiRequest('/api/auth/login', { method: 'POST', body: { email: admin.email, password }, expectedStatus: 200 })
    const result = await apiRequest(endpoint, { token: login.token })
    expect(result.status).toBe('pending')
    await apiRequest('/api/auth/logout', { method: 'PUT', token: login.token })
  })

  it('surfaces server validation and authentication errors without creating rows', async () => {
    const count = await db.Campaign.count({ where: { createdBy: user.userId } })
    await expect(submitCampaign({ ...payload(), title: '' }, { token })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' })
    await expect(submitCampaign(payload(), { token: 'invalid-token' })).rejects.toMatchObject({ status: 401, code: 'INVALID_TOKEN' })
    expect(await db.Campaign.count({ where: { createdBy: user.userId } })).toBe(count)
  })

  it('logs out through the page, revokes the database session and rejects the old token', async () => {
    storeSession(token, { id: user.userId, role: 'public', name: 'Frontend integration' })
    render(<LogoutPage />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('You’re logged out.'))
    expect(getSession().token).toBeNull()
    const session = await db.UserSession.findOne({ where: { token } })
    expect(session.status).toBe('expired')
    expect(session.logoutAt).toBeTruthy()
    await expect(submitCampaign(payload(), { token })).rejects.toMatchObject({ status: 401, code: 'INVALID_TOKEN' })
  })
})

describe.sequential('additional frontend flows → real API → disposable MySQL', () => {
  const users = []
  const campaigns = []
  const businesses = []
  let participant, ownerA, ownerB, moderator
  let participantToken, ownerAToken, ownerBToken, moderatorToken
  let cause, managed, businessCampaign, businessA
  let journeyOwner, journeyToken, journeyBusiness, journeyCampaign, journeyImageBytes
  const journeyEmail = `new-business-${tag}@example.test`
  const journeyBusinessName = `New business ${tag}`
  const journeyTitle = `New business campaign ${tag}`

  async function login(account) {
    return (await apiRequest('/api/auth/login', { method: 'POST', body: { email: account.email, password }, expectedStatus: 200 })).token
  }
  async function account(name, role, passwordHash) {
    const row = await db.User.create({ fullName: `Additional ${name} ${tag}`, email: `additional-${name}-${tag}@example.test`, passwordHash, role, status: 'active' })
    users.push(row.userId)
    return row
  }
  async function campaign(title, extra = {}) {
    const row = await db.Campaign.create({ ...payload(), title: `${title} ${tag}`, createdBy: participant.userId, status: 'approved', ...extra })
    campaigns.push(row.campaignId)
    return row
  }

  beforeAll(async () => {
    const hash = await bcrypt.hash(password, 10)
    participant = await account('participant', 'public', hash)
    ownerA = await account('owner-a', 'business_owner', hash)
    ownerB = await account('owner-b', 'business_owner', hash)
    moderator = await account('moderator', 'admin', hash)
    participantToken = await login(participant)
    ownerAToken = await login(ownerA)
    ownerBToken = await login(ownerB)
    moderatorToken = await login(moderator)
    // Existing linked-business fixtures exercise historical inbox isolation.
    // The fresh onboarding journey below creates its profile through the API.
    const businessRowA = await db.Business.create({ ownerId: ownerA.userId, businessName: `Business A ${tag}` })
    businesses.push(businessRowA.businessId)
    businessA = { id: businessRowA.businessId }
    const businessRowB = await db.Business.create({ ownerId: ownerB.userId, businessName: `Business B ${tag}` })
    businesses.push(businessRowB.businessId)
    cause = await campaign('Participation fixture')
    managed = await campaign('Owner edit fixture')
    businessCampaign = await campaign('Enquiry fixture', { businessId: businessA.id, createdBy: ownerA.userId })
  })

  afterAll(async () => {
    // Delete only this suite's fixtures, in foreign-key order. The runner owns
    // the disposable database; no resets or other accounts are touched here.
    if (campaigns.length) {
      await db.Lead.destroy({ where: { campaignId: campaigns } })
      await db.Participation.destroy({ where: { campaignId: campaigns } })
      await db.CampaignReview.destroy({ where: { campaignId: campaigns } })
      await db.ManagementAudit.destroy({ where: { targetType: 'campaign', targetId: campaigns } })
      await db.CampaignImage.destroy({ where: { campaignId: campaigns } })
      await db.Campaign.destroy({ where: { campaignId: campaigns }, force: true })
    }
    if (businesses.length) await db.Business.destroy({ where: { businessId: businesses } })
    if (users.length) {
      await db.CampaignImage.destroy({ where: { ownerId: users } })
      await db.ManagementAudit.destroy({ where: { targetType: 'user', targetId: users } })
      await db.UserSession.destroy({ where: { userId: users } })
      await db.User.destroy({ where: { userId: users } })
    }
  })

  it('registers and signs in a new business owner through real pages, then loads an empty profile without seeding one', async () => {
    render(<RegistrationPage />)
    registerForm(journeyEmail)
    change('Account type', 'business')
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Registration successful'))
    journeyOwner = await db.User.scope('withPassword').findOne({ where: { email: journeyEmail } })
    users.push(journeyOwner.userId)
    expect(journeyOwner.role).toBe('business_owner')
    expect(await bcrypt.compare(password, journeyOwner.passwordHash)).toBe(true)
    expect(await db.Business.count({ where: { ownerId: journeyOwner.userId } })).toBe(0)
    expect(getSession().token).toBeNull()

    cleanup()
    render(<LoginPage />)
    change('Email', journeyEmail)
    change('Password', password)
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    await waitFor(() => expect(getSession().token).toBeTruthy())
    journeyToken = getSession().token
    expect(getSession().user).toMatchObject({ id: journeyOwner.userId, role: 'business_owner' })
    expect(await loadBusinessProfile({ token: journeyToken })).toBeNull()

    cleanup()
    render(<BusinessProfilePage token={journeyToken} role="business_owner" />)
    expect(await screen.findByLabelText('Business name')).toHaveProperty('value', '')
    expect(screen.getByRole('button', { name: 'Save business profile' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await db.Business.count({ where: { ownerId: journeyOwner.userId } })).toBe(0)
  })

  it('saves the first business profile through the form, reloads it, and persists cleared optional fields as SQL null', async () => {
    render(<BusinessProfilePage token={journeyToken} role="business_owner" />)
    await screen.findByLabelText('Business name')
    change('Business name', `  ${journeyBusinessName}  `)
    change(/ABN/, ' local-reference ')
    change(/Website/, ' https://business.example.test ')
    change(/About your business/, '  A harmless local integration business.  ')
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    await screen.findByRole('heading', { name: 'Business profile saved' })
    journeyBusiness = await db.Business.findOne({ where: { ownerId: journeyOwner.userId } })
    businesses.push(journeyBusiness.businessId)
    expect(journeyBusiness).toMatchObject({ businessName: journeyBusinessName, abn: 'local-reference', website: 'https://business.example.test', description: 'A harmless local integration business.' })
    expect(await db.Business.count({ where: { ownerId: journeyOwner.userId } })).toBe(1)
    expect((await loadBusinessProfile({ token: ownerAToken })).id).toBe(businessA.id)

    cleanup()
    render(<BusinessProfilePage token={journeyToken} role="business_owner" />)
    expect(await screen.findByLabelText('Business name')).toHaveProperty('value', journeyBusinessName)
    expect(screen.getByLabelText(/Website/).value).toBe('https://business.example.test')
    for (const field of [/ABN/, /Website/, /About your business/]) change(field, '')
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    await screen.findByRole('heading', { name: 'Business profile saved' })
    expect(await loadBusinessProfile({ token: journeyToken })).toEqual({ id: journeyBusiness.businessId, businessName: journeyBusinessName, abn: null, website: null, description: null })
    expect(await journeyBusiness.reload()).toMatchObject({ abn: null, website: null, description: null })
    expect(await db.Business.count({ where: { ownerId: journeyOwner.userId } })).toBe(1)
  })

  it('handles real profile field validation without changing persisted values or another owner', async () => {
    const invalid = { businessName: 'B'.repeat(151), abn: '', website: '', description: '' }
    await expect(saveBusinessProfile(invalid, { token: journeyToken })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED', fieldErrors: { businessName: expect.any(String) } })
    await expect(apiRequest('/api/business/me', { method: 'PUT', token: journeyToken, body: { businessName: journeyBusinessName, website: 'https://user:secret@example.test' } })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED', fieldErrors: { website: expect.any(String) } })
    await expect(loadBusinessProfile({ token: participantToken })).rejects.toMatchObject({ status: 403 })
    expect((await loadBusinessProfile({ token: journeyToken })).businessName).toBe(journeyBusinessName)
    expect((await loadBusinessProfile({ token: ownerAToken })).id).toBe(businessA.id)

    render(<BusinessProfilePage token={journeyToken} role="business_owner" />)
    await screen.findByLabelText('Business name')
    change(/Website/, 'ftp://example.test')
    fireEvent.click(screen.getByRole('button', { name: 'Save business profile' }))
    expect(screen.getByLabelText(/Website/).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText(/Website/).getAttribute('aria-describedby')).toBe('business-website-error')
    expect(document.activeElement).toBe(screen.getByLabelText(/Website/))
    expect(await journeyBusiness.reload()).toMatchObject({ businessName: journeyBusinessName, website: null })
  })

  it('posts a photo-backed business campaign through the actual page and reloads its private persisted photo', async () => {
    storeSession(journeyToken, { id: journeyOwner.userId, role: 'business_owner', name: 'New integration business' })
    render(<CreateCampaignPage token={journeyToken} role="business_owner" mode="business" />)
    await screen.findByRole('option', { name: category.categoryName })
    await screen.findByText(journeyBusinessName)
    const value = { ...payload(), title: journeyTitle }
    change('Campaign title', value.title)
    change('Description', value.description)
    change('Category', String(value.categoryId))
    change('Start date', value.startDate)
    change('End date', value.endDate)
    const photo = await sharp({ create: { width: 8, height: 6, channels: 3, background: 'green' } }).jpeg().toBuffer()
    fireEvent.change(screen.getByLabelText(/Campaign photo/), { target: { files: [new NativeFile([photo], 'business-test.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit campaign for review' }))
    await screen.findByRole('heading', { name: 'Campaign submitted' })
    journeyCampaign = await db.Campaign.findOne({ where: { title: journeyTitle } })
    campaigns.push(journeyCampaign.campaignId)
    expect(journeyCampaign).toMatchObject({ createdBy: journeyOwner.userId, businessId: journeyBusiness.businessId, status: 'pending', imageUrl: null })
    const image = await db.CampaignImage.findOne({ where: { campaignId: journeyCampaign.campaignId } })
    expect(image).toMatchObject({ ownerId: journeyOwner.userId, contentType: 'image/jpeg' })
    const saved = await loadOwnedCampaign(journeyCampaign.campaignId, { token: journeyToken })
    expect(saved.imageUrl).toBeTruthy()
    const privatePhoto = await fetch(new URL(saved.imageUrl, apiOrigin))
    expect(privatePhoto.status).toBe(200)
    journeyImageBytes = Buffer.from(await privatePhoto.arrayBuffer())
    expect(await sharp(journeyImageBytes).metadata()).toMatchObject({ format: 'jpeg', width: 8, height: 6 })
    await expect(getCampaignById(journeyCampaign.campaignId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(loadOwnedCampaign(journeyCampaign.campaignId, { token: ownerBToken })).rejects.toMatchObject({ status: 404 })
  })

  it('approves the newly posted business campaign through the real admin page and preserves its public photo', async () => {
    render(<AdminCampaignReviewPage token={moderatorToken} role="admin" campaignId={journeyCampaign.campaignId} />)
    await screen.findByRole('heading', { name: journeyTitle })
    fireEvent.click(screen.getByLabelText('Approve campaign'))
    change('Review comments (optional)', 'New-business integration review.')
    fireEvent.click(screen.getByRole('button', { name: 'Review decision' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    await screen.findByText('Campaign approved. It is now available publicly.')
    expect(await journeyCampaign.reload()).toHaveProperty('status', 'approved')
    const publicCampaign = (await getCampaignById(journeyCampaign.campaignId)).campaign
    expect(publicCampaign).toMatchObject({ type: 'business', business: { id: journeyBusiness.businessId, businessName: journeyBusinessName } })
    const publicPhoto = await fetch(new URL(publicCampaign.imageUrl, apiOrigin))
    expect(publicPhoto.status).toBe(200)
    expect(Buffer.from(await publicPhoto.arrayBuffer())).toEqual(journeyImageBytes)
    expect((await loadCampaignReviews(journeyCampaign.campaignId, { token: moderatorToken })).reviews).toHaveLength(1)
  })

  it('sends a real enquiry to the newly onboarded business and reads it only through its owner inbox', async () => {
    const publicCampaign = (await getCampaignById(journeyCampaign.campaignId)).campaign
    render(<CampaignEnquiryForm campaign={publicCampaign} token={participantToken} role="public" />)
    change('Name', '  New-business visitor  ')
    change('Email', 'NEW-VISITOR@EXAMPLE.TEST')
    change('Message', `  New business enquiry ${tag}.  `)
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
    await screen.findByRole('heading', { name: 'Enquiry sent' })
    const rows = await db.Lead.findAll({ where: { campaignId: journeyCampaign.campaignId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ businessId: journeyBusiness.businessId, userId: participant.userId, name: 'New-business visitor', email: 'new-visitor@example.test', phone: null, message: `New business enquiry ${tag}.` })
    cleanup()
    render(<BusinessEnquiriesPage token={journeyToken} role="business_owner" />)
    await screen.findByText(`New business enquiry ${tag}.`)
    expect(screen.getByRole('link', { name: 'new-visitor@example.test' })).toBeTruthy()
    cleanup()
    render(<BusinessEnquiriesPage token={ownerBToken} role="business_owner" />)
    await screen.findByText('No enquiries on this page.')
    expect(screen.queryByText(`New business enquiry ${tag}.`)).toBeNull()
    expect((await loadBusinessEnquiries({ token: ownerBToken })).total).toBe(0)
  })

  it('logs out the newly onboarded owner and rejects their profile and inbox token while retaining saved business data', async () => {
    storeSession(journeyToken, { id: journeyOwner.userId, role: 'business_owner', name: 'New integration business' })
    render(<LogoutPage />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('You’re logged out.'))
    expect((await db.UserSession.findOne({ where: { token: journeyToken } })).status).toBe('expired')
    await expect(loadBusinessProfile({ token: journeyToken })).rejects.toMatchObject({ status: 401 })
    await expect(loadBusinessEnquiries({ token: journeyToken })).rejects.toMatchObject({ status: 401 })
    expect(await journeyBusiness.reload()).toHaveProperty('businessName', journeyBusinessName)
  })

  it('joins and withdraws through the participation component and reads the saved first-join timestamp', async () => {
    const publicCampaign = (await getCampaignById(cause.campaignId)).campaign
    render(<CampaignParticipation campaign={publicCampaign} token={participantToken} role="public" />)
    await screen.findByText('You have not joined this campaign yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Join campaign' }))
    await screen.findByText('You have joined this campaign.')
    const first = await loadParticipation(cause.campaignId, { token: participantToken })
    const persisted = await db.Participation.findOne({ where: { userId: participant.userId, campaignId: cause.campaignId } })
    expect(first).toMatchObject({ id: persisted.participationId, campaignId: cause.campaignId, status: 'joined', participatedAt: persisted.participatedAt.toISOString() })
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw participation' }))
    await screen.findByText('You have withdrawn from this campaign.')
    expect(await loadParticipation(cause.campaignId, { token: participantToken })).toEqual({ ...first, status: 'withdrawn' })
    expect((await persisted.reload()).status).toBe('withdrawn')
  })

  it('rejoins idempotently and paginates only the current account through strict frontend parsers', async () => {
    const joined = await setParticipation(cause.campaignId, 'joined', { token: participantToken })
    expect(await setParticipation(cause.campaignId, 'joined', { token: participantToken })).toEqual(joined)
    expect(await db.Participation.count({ where: { userId: participant.userId, campaignId: cause.campaignId } })).toBe(1)
    const page = await loadMyParticipation({ token: participantToken, page: 1, pageSize: 1 })
    expect(page).toMatchObject({ page: 1, pageSize: 1, total: 1, participations: [{ ...joined, campaign: { id: cause.campaignId, status: 'approved', type: 'cause' } }] })
    expect(await loadMyParticipation({ token: participantToken, page: 2, pageSize: 1 })).toEqual({ participations: [], page: 2, pageSize: 1, total: 1 })
    expect(await loadMyParticipation({ token: ownerBToken })).toMatchObject({ participations: [], total: 0 })
  })

  it('shows no private title after unpublishing and still withdraws from My participation', async () => {
    const snapshot = await loadAdminCampaign(cause.campaignId, { token: moderatorToken })
    await unpublishCampaign(cause.campaignId, 'Testing private participation history.', { token: moderatorToken, expectedUpdatedAt: snapshot.updatedAt })
    expect((await loadMyParticipation({ token: participantToken })).participations[0].campaign).toBeNull()
    await expect(getCampaignById(cause.campaignId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    render(<MyParticipationPage token={participantToken} role="public" />)
    await screen.findByRole('heading', { name: 'Campaign unavailable' })
    expect(screen.queryByText(cause.title)).toBeNull()
    expect(screen.queryByRole('link', { name: /View campaign/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `Withdraw participation: campaign #${cause.campaignId}` }))
    await screen.findByText('Withdrawn')
    expect(await loadParticipation(cause.campaignId, { token: participantToken })).toMatchObject({ status: 'withdrawn' })
    expect((await db.Participation.findOne({ where: { userId: participant.userId, campaignId: cause.campaignId } })).status).toBe('withdrawn')
    await expect(setParticipation(cause.campaignId, 'joined', { token: participantToken })).rejects.toMatchObject({ status: 404 })
  })

  it('sends an enquiry through the form and displays it only in the receiving business inbox', async () => {
    const publicCampaign = (await getCampaignById(businessCampaign.campaignId)).campaign
    render(<CampaignEnquiryForm campaign={publicCampaign} token={participantToken} role="public" />)
    change('Name', '  Interested visitor  ')
    change('Email', 'VISITOR@EXAMPLE.TEST')
    change(/Phone/, ' 0400000000 ')
    change('Message', `  Please tell me more ${tag}.  `)
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
    await screen.findByRole('heading', { name: 'Enquiry sent' })
    const rows = await db.Lead.findAll({ where: { campaignId: businessCampaign.campaignId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ businessId: businessA.id, userId: participant.userId, name: 'Interested visitor', email: 'visitor@example.test', phone: '0400000000', message: `Please tell me more ${tag}.` })
    expect((await loadBusinessEnquiries({ token: ownerAToken })).enquiries[0]).toMatchObject({ id: rows[0].leadId, campaignId: businessCampaign.campaignId, createdAt: rows[0].createdAt.toISOString() })
    cleanup()
    render(<BusinessEnquiriesPage token={ownerAToken} role="business_owner" />)
    await screen.findByText(`Please tell me more ${tag}.`)
    expect(screen.getByRole('link', { name: 'visitor@example.test' })).toBeTruthy()
    cleanup()
    render(<BusinessEnquiriesPage token={ownerBToken} role="business_owner" />)
    await screen.findByText('No enquiries on this page.')
    expect(screen.queryByText(`Please tell me more ${tag}.`)).toBeNull()
    expect((await loadBusinessEnquiries({ token: ownerBToken })).total).toBe(0)
  })

  it('keeps existing enquiries readable after deletion but rejects new enquiries', async () => {
    const snapshot = await loadOwnedCampaign(businessCampaign.campaignId, { token: ownerAToken })
    await deleteOwnedCampaign(businessCampaign.campaignId, snapshot.updatedAt, { token: ownerAToken })
    expect((await db.Campaign.findByPk(businessCampaign.campaignId)).deletedAt).toBeTruthy()
    const inbox = await loadBusinessEnquiries({ token: ownerAToken })
    expect(inbox).toMatchObject({ total: 1, enquiries: [{ campaignId: businessCampaign.campaignId, campaign: null }] })
    await expect(sendCampaignEnquiry(businessCampaign.campaignId, { name: 'Visitor', email: 'visitor@example.test', message: 'Should not save.' }, { token: participantToken })).rejects.toMatchObject({ status: 404 })
    expect(await db.Lead.count({ where: { campaignId: businessCampaign.campaignId } })).toBe(1)
  })

  it('edits an owned campaign, rejects a stale edit and publishes the reviewed version with readable history', async () => {
    const initial = await loadOwnedCampaign(managed.campaignId, { token: participantToken })
    const edit = { ...payload(), title: `Edited owner fixture ${tag}`, expectedUpdatedAt: initial.updatedAt }
    const pending = await saveOwnedCampaign(managed.campaignId, edit, { token: participantToken })
    expect(pending).toMatchObject({ status: 'pending', title: edit.title })
    await expect(saveOwnedCampaign(managed.campaignId, edit, { token: participantToken })).rejects.toMatchObject({ status: 409, code: 'CAMPAIGN_CHANGED' })
    await expect(loadOwnedCampaign(managed.campaignId, { token: ownerBToken })).rejects.toMatchObject({ status: 404 })
    await expect(getCampaignById(managed.campaignId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const decision = await reviewCampaign(managed.campaignId, { status: 'approved', comments: 'Fixture reviewed.', expectedUpdatedAt: pending.updatedAt }, { token: moderatorToken })
    const history = await loadCampaignReviews(managed.campaignId, { token: moderatorToken })
    expect(history).toMatchObject({ total: 1, reviews: [decision.review] })
    expect((await getCampaignById(managed.campaignId)).campaign.title).toBe(edit.title)
    expect((await db.Campaign.findByPk(managed.campaignId)).status).toBe('approved')
    await deleteCampaign(managed.campaignId, 'Integration fixture cleanup decision.', { token: moderatorToken, expectedUpdatedAt: decision.campaign.updatedAt })
    await expect(getCampaignById(managed.campaignId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await db.ManagementAudit.count({ where: { targetType: 'campaign', targetId: managed.campaignId, action: 'campaign_deleted' } })).toBe(1)
  })

  it('suspends an account, revokes sessions and requires a new login after reactivation', async () => {
    const listing = await loadAdminUsers({ token: moderatorToken, search: participant.email })
    expect(listing).toMatchObject({ total: 1, users: [{ id: participant.userId, status: 'active' }] })
    expect(await changeUserStatus(participant.userId, 'suspended', { token: moderatorToken })).toMatchObject({ id: participant.userId, status: 'suspended' })
    expect(await db.UserSession.count({ where: { userId: participant.userId, status: 'active' } })).toBe(0)
    // Suspension also expires sessions, so this old token is rejected before
    // the guard reaches the account-status check.
    await expect(loadMyParticipation({ token: participantToken })).rejects.toMatchObject({ status: 401 })
    expect(await changeUserStatus(participant.userId, 'active', { token: moderatorToken })).toMatchObject({ status: 'active' })
    await expect(loadMyParticipation({ token: participantToken })).rejects.toMatchObject({ status: 401 })
    participantToken = await login(participant)
    expect((await loadMyParticipation({ token: participantToken })).total).toBe(1)
    await expect(changeUserStatus(moderator.userId, 'suspended', { token: moderatorToken })).rejects.toMatchObject({ status: 403 })
  })

  it('rejects private engagement reads and writes after a real logout without deleting history', async () => {
    await apiRequest('/api/auth/logout', { method: 'PUT', token: participantToken })
    await expect(loadMyParticipation({ token: participantToken })).rejects.toMatchObject({ status: 401 })
    await expect(loadParticipation(cause.campaignId, { token: participantToken })).rejects.toMatchObject({ status: 401 })
    await expect(setParticipation(cause.campaignId, 'withdrawn', { token: participantToken })).rejects.toMatchObject({ status: 401 })
    expect(await db.Participation.count({ where: { userId: participant.userId, campaignId: cause.campaignId } })).toBe(1)
  })
})
