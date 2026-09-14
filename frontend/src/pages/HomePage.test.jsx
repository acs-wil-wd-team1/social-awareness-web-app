import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'
import HomePage from './HomePage.jsx'
import { listCampaigns, selectPublicCampaigns } from '../services/campaignService.js'

const backendCampaigns = [
  {
    id: 4,
    title: 'Books for Kids',
    description: 'Collecting books.',
    category: 'Education',
    imageUrl: null,
    createdBy: 3,
    status: 'approved',
    createdAt: '2026-09-04T00:00:00Z',
  },
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
    id: 2,
    title: 'Mindful Mornings',
    description: 'Free mindfulness sessions.',
    category: 'Health & Wellbeing',
    imageUrl: null,
    createdBy: 2,
    status: 'approved',
    createdAt: '2026-09-02T00:00:00Z',
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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    campaigns: backendCampaigns,
    page: 1,
    pageSize: 100,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CauseConnect campaign homepage', () => {
  it('renders the guest homepage structure without Stage 3 actions', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Raise awareness. Create change.' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Current campaigns' })).toBeTruthy()
    expect(screen.queryByText(/prototype 1/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /participate/i })).toBeNull()
    expect(screen.queryByText(/campaign creation/i)).toBeNull()

    expect(await screen.findByRole('heading', { level: 3, name: 'Books for Kids' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Community Food Drive' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Mindful Mornings' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Zero-Waste Week' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View Zero-Waste Week' }).getAttribute('href'))
      .toBe('/campaigns/1')
    expect(screen.getAllByRole('link', { name: /^View / })).toHaveLength(4)
    expect(screen.getByText('4 campaigns')).toBeTruthy()
  })

  it('maps the backend campaign response to the frontend list shape', async () => {
    const response = await listCampaigns()

    expect(response).toMatchObject({ page: 1, pageSize: 100, total: 4 })
    expect(response.items.every(({ status }) => status === 'approved')).toBe(true)
    expect(response.items.every(({ imageUrl }) => imageUrl === '/campaign-placeholder.svg')).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/api/campaigns?page=1&pageSize=100', expect.any(Object))
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
    const campaignLoader = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 })

    render(<HomePage campaignLoader={campaignLoader} />)

    expect(await screen.findByRole('heading', { level: 3, name: 'No campaigns are available yet' })).toBeTruthy()
  })

  it('shows an error state and retries the request', async () => {
    const recoveredCampaign = {
      id: '6',
      title: 'Recovered Campaign',
      description: 'Loaded after a retry.',
      category: 'Community',
      status: 'approved',
    }
    const campaignLoader = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce({ items: [recoveredCampaign], page: 1, pageSize: 100, total: 1 })

    render(<HomePage campaignLoader={campaignLoader} />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Recovered Campaign' })).toBeTruthy()
    expect(campaignLoader).toHaveBeenCalledTimes(2)
  })
})
