import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import CampaignDetailsPage from './CampaignDetailsPage.jsx'
import { getCampaignById } from '../services/campaignService.js'

const backendCampaigns = [
  {
    id: 3,
    title: 'Community Food Drive',
    description: 'Food for the local shelter.',
    category: 'Community Support',
    imageUrl: null,
    createdBy: 3,
    status: 'approved',
    createdAt: '2026-09-03T00:00:00Z',
  },
  {
    id: 1,
    title: 'Zero-Waste Week',
    description: 'A week of zero-waste practices.',
    category: 'Environment',
    imageUrl: null,
    createdBy: 2,
    status: 'approved',
    createdAt: '2026-09-01T00:00:00Z',
  },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
    const campaignId = String(url).split('/').at(-1)
    const campaign = backendCampaigns.find(({ id }) => String(id) === campaignId)

    return Promise.resolve(new Response(JSON.stringify(
      campaign ?? {
        status: 404,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign not found',
        fieldErrors: null,
      },
    ), {
      status: campaign ? 200 : 404,
      headers: { 'Content-Type': 'application/json' },
    }))
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CauseConnect campaign details', () => {
  it('renders the campaign selected from the homepage without Stage 3 actions', async () => {
    render(<App pathname="/campaigns/1" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Zero-Waste Week' })).toBeTruthy()
    expect(screen.getAllByText('Environment')).toHaveLength(2)
    expect(screen.getByText('A week of zero-waste practices.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Campaign information' })).toBeTruthy()
    expect(screen.getByText('Not specified')).toBeTruthy()
    expect(screen.getByText('1 September 2026')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to campaigns' }).getAttribute('href')).toBe('/#campaigns')
    expect(screen.queryByRole('button', { name: /participate/i })).toBeNull()
    expect(screen.queryByText(/campaign posting/i)).toBeNull()
  })

  it('loads an approved integer-ID campaign from the details response', async () => {
    const response = await getCampaignById('3')

    expect(response).toMatchObject({
      campaign: {
        id: '3',
        title: 'Community Food Drive',
        status: 'approved',
        type: null,
      },
    })
    expect(fetch).toHaveBeenCalledWith('/api/campaigns/3', expect.any(Object))
  })

  it('shows a clear not-found state for an unavailable campaign', async () => {
    render(<App pathname="/campaigns/999" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Campaign not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to campaigns' })).toBeTruthy()
  })

  it('allows a failed campaign request to be retried', async () => {
    const campaignLoader = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({
        campaign: {
          id: '6',
          title: 'Recovered Campaign',
          description: 'Loaded after a retry.',
          category: 'Community',
          status: 'approved',
        },
      })

    render(
      <CampaignDetailsPage
        campaignId="6"
        campaignLoader={campaignLoader}
      />,
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Campaign could not be loaded' })).toBeTruthy()
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(await screen.findByRole('heading', { level: 1, name: 'Recovered Campaign' })).toBeTruthy()
    expect(campaignLoader).toHaveBeenCalledTimes(2)
  })
})
