import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/apiClient.js'
import { managementErrorMessage } from '../services/campaignManagementService.js'
import HomePage from './HomePage.jsx'
import CampaignDetailsPage from './CampaignDetailsPage.jsx'
import AdminUsersPage from './AdminUsersPage.jsx'
import MyCampaignsPage from './MyCampaignsPage.jsx'
import CampaignReviewHistory from '../components/CampaignReviewHistory.jsx'

const message = 'Too many requests. Please wait a minute before trying again.'
const limited = () => vi.fn().mockRejectedValue(new ApiError(message, { status: 429, code: 'RATE_LIMITED' }))
afterEach(cleanup)

describe('Rate-limit recovery messages', () => {
  it.each([
    ['public campaigns', () => <HomePage campaignLoader={limited()} categoryLoader={async () => []} />],
    ['campaign details', () => <CampaignDetailsPage campaignId="3" campaignLoader={limited()} />],
    ['administrator accounts', () => <AdminUsersPage token="admin" role="admin" userLoader={limited()} />],
    ['owner campaigns', () => <MyCampaignsPage token="owner" role="public" campaignLoader={limited()} />],
    ['review history', () => <CampaignReviewHistory campaignId={3} token="admin" role="admin" historyLoader={limited()} />],
  ])('keeps the actionable wait message on %s instead of replacing it with a generic retry', async (_name, component) => {
    render(component())
    expect(await screen.findByText(message)).toBeTruthy()
  })

  it('preserves rate-limit messages in the campaign management error adapter', () => {
    expect(managementErrorMessage(new ApiError(message, { status: 429 }))).toBe(message)
    expect(managementErrorMessage({ status: 429 })).toBe(message)
  })
})
