import React from 'react'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import RegistrationPage from '../src/pages/RegistrationPage.jsx'
import LoginPage from '../src/pages/LoginPage.jsx'
import LogoutPage from '../src/pages/LogoutPage.jsx'
import CreateCampaignPage from '../src/pages/CreateCampaignPage.jsx'
import { apiRequest, DEMO_MODE } from '../src/services/apiClient.js'
import { getSession, storeSession } from '../src/services/authSession.js'
import { loadCampaignCategories, submitCampaign } from '../src/services/campaignSubmissionService.js'
import { listCampaigns, getCampaignById } from '../src/services/campaignService.js'

// Native fetch is deliberately untouched. These requests reach the real Express app.
const require = createRequire(path.resolve(process.cwd(), '../backend/package.json'))
const db = require('./src/database/models')
const bcrypt = require('bcrypt')
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
  await db.sequelize.authenticate()
  category = await db.Category.create({ categoryName: `Integration ${tag}` })
  admin = await db.User.create({ fullName: 'Test admin', email: `admin-${tag}@example.test`, passwordHash: await bcrypt.hash(password, 10), role: 'admin', status: 'active' })
  approved = await db.Campaign.create({ title: `Approved ${tag}`, description: 'Existing approved record.', categoryId: category.categoryId, createdBy: admin.userId, status: 'approved' })
})
afterEach(() => { cleanup(); localStorage.clear() })
afterAll(async () => { await db.sequelize.close() })

describe.sequential('frontend → real Express → disposable MySQL', () => {
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
    const count = await db.Campaign.count()
    await expect(submitCampaign({ ...payload(), title: '' }, { token })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' })
    await expect(submitCampaign(payload(), { token: 'invalid-token' })).rejects.toMatchObject({ status: 401, code: 'INVALID_TOKEN' })
    expect(await db.Campaign.count()).toBe(count)
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
