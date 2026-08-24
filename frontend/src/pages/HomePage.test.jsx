import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import HomePage from './HomePage.jsx'
import { listCampaigns, selectPublicCampaigns } from '../services/campaignService.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CauseConnect campaign homepage', () => {
  it('renders the guest homepage structure without Stage 3 actions', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Raise awareness. Create change.' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Current campaigns' })).toBeTruthy()
    expect(screen.queryByText(/prototype 1/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /participate/i })).toBeNull()
    expect(screen.queryByText(/campaign creation/i)).toBeNull()

    expect(await screen.findByRole('heading', { level: 3, name: 'Clean Water Initiative' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Community Food Drive' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Digital Skills Workshops' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View Clean Water Initiative' }).getAttribute('href'))
      .toBe('/campaigns/clean-water-initiative')
    expect(screen.getAllByRole('link', { name: /^View / })).toHaveLength(3)
    expect(screen.getByText('3 campaigns')).toBeTruthy()
  })

  it('returns approved campaigns in the draft list-response shape', async () => {
    const response = await listCampaigns()

    expect(response).toMatchObject({ page: 1, pageSize: 20, total: 3 })
    expect(response.items.every(({ status }) => status === 'approved')).toBe(true)
    expect(response.items.every(({ type }) => type === 'cause')).toBe(true)
  })

  it('filters hidden campaigns and applies the draft sort order', () => {
    const campaigns = [
      { id: 'alpha', status: 'approved', createdAt: '2026-08-21T06:00:00Z' },
      { id: 'beta', status: 'approved', createdAt: '2026-08-21T06:00:00Z' },
      { id: 'hidden', status: 'pending', createdAt: '2026-08-22T06:00:00Z' },
    ]

    expect(selectPublicCampaigns(campaigns).map(({ id }) => id)).toEqual(['beta', 'alpha'])
  })

  it('shows an empty state when the API returns no campaigns', async () => {
    const campaignLoader = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 })

    render(<HomePage campaignLoader={campaignLoader} />)

    expect(await screen.findByRole('heading', { level: 3, name: 'No campaigns are available yet' })).toBeTruthy()
  })

  it('shows an error state and retries the request', async () => {
    const recoveredCampaign = {
      id: 'recovered-campaign',
      title: 'Recovered Campaign',
      description: 'Loaded after a retry.',
      category: 'Community',
      status: 'approved',
    }
    const campaignLoader = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ items: [recoveredCampaign], page: 1, pageSize: 20, total: 1 })

    render(<HomePage campaignLoader={campaignLoader} />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Recovered Campaign' })).toBeTruthy()
    expect(campaignLoader).toHaveBeenCalledTimes(2)
  })
})
