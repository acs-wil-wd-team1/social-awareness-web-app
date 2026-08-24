import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import CampaignDetailsPage from './CampaignDetailsPage.jsx'
import { getCampaignById } from '../services/campaignService.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CauseConnect campaign details', () => {
  it('renders the campaign selected from the homepage without Stage 3 actions', async () => {
    render(<App pathname="/campaigns/clean-water-initiative" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Clean Water Initiative' })).toBeTruthy()
    expect(screen.getAllByText('Environment')).toHaveLength(2)
    expect(screen.getByText('Supporting community access to clean and safe drinking water.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'About this campaign' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Campaign goals' })).toBeTruthy()
    expect(screen.getByText('Support practical community water initiatives.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Campaign information' })).toBeTruthy()
    expect(screen.getByText('Social cause')).toBeTruthy()
    expect(screen.getByText('21 August 2026')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to campaigns' }).getAttribute('href')).toBe('/#campaigns')
    expect(screen.queryByRole('button', { name: /participate/i })).toBeNull()
    expect(screen.queryByText(/campaign posting/i)).toBeNull()
  })

  it('returns one approved campaign in the draft response shape', async () => {
    const response = await getCampaignById('community-food-drive')

    expect(response).toMatchObject({
        campaign: {
          id: 'community-food-drive',
          status: 'approved',
          type: 'cause',
          details: expect.any(String),
          goals: expect.any(Array),
        },
    })
  })

  it('shows a clear not-found state for an unavailable campaign', async () => {
    render(<App pathname="/campaigns/not-a-campaign" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Campaign not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to campaigns' })).toBeTruthy()
  })

  it('allows a failed campaign request to be retried', async () => {
    const campaignLoader = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({
        campaign: {
          id: 'recovered-campaign',
          title: 'Recovered Campaign',
          description: 'Loaded after a retry.',
          category: 'Community',
          status: 'approved',
        },
      })

    render(
      <CampaignDetailsPage
        campaignId="recovered-campaign"
        campaignLoader={campaignLoader}
      />,
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Campaign could not be loaded' })).toBeTruthy()
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(await screen.findByRole('heading', { level: 1, name: 'Recovered Campaign' })).toBeTruthy()
    expect(campaignLoader).toHaveBeenCalledTimes(2)
  })
})
