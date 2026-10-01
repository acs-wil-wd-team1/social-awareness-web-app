import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('engagement on campaign details', () => {
  it('recovers a hidden failed image when the refreshed campaign supplies a new URL', async () => {
    const campaignLoader = vi.fn().mockResolvedValueOnce({ campaign: { ...backendCampaigns[0], imageUrl: '/photo-old.jpg' } })
      .mockResolvedValueOnce({ campaign: { ...backendCampaigns[0], imageUrl: '/photo-new.jpg' } })
    const { container } = render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    await screen.findByText('Community Food Drive')
    const oldImage = container.querySelector('.campaign-details__media img')
    fireEvent.error(oldImage)
    fireEvent.error(oldImage)
    expect(oldImage.hidden).toBe(true)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh campaign' })))
    const refreshedImage = container.querySelector('.campaign-details__media img')
    expect(refreshedImage.getAttribute('src')).toBe('/photo-new.jpg')
    expect(refreshedImage.hidden).toBe(false)
    expect(refreshedImage.dataset.fallback).toBeUndefined()
  })

  it.each([
    ['cause', 'Log in to join'], ['business', 'Log in to send an enquiry'],
  ])('shows the %s action on an approved campaign', async (type, action) => {
    const campaignLoader = vi.fn().mockResolvedValue({ campaign: { ...backendCampaigns[0], type } })
    render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    expect((await screen.findByRole('link', { name: action })).getAttribute('href')).toBe('/login?returnTo=%2Fcampaigns%2F3')
  })

  it('keeps a typed enquiry during background content refresh', async () => {
    const campaignLoader = vi.fn().mockResolvedValue({ campaign: { ...backendCampaigns[0], type: 'business' } })
    render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} token="user-token" role="public" />)
    const message = await screen.findByLabelText('Message')
    fireEvent.change(message, { target: { value: 'Please send the session times.' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh campaign' })))
    expect(screen.getByLabelText('Message')).toBe(message)
    expect(screen.getByLabelText('Message').value).toBe('Please send the session times.')
  })
})

describe('campaign details background refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    localStorage.clear()
  })

  it('keeps the same campaign content mounted while checking for changes', async () => {
    let finishRefresh
    const campaignLoader = vi.fn().mockResolvedValueOnce({ campaign: backendCampaigns[0] })
      .mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    await act(async () => {})
    const title = screen.getByRole('heading', { name: 'Community Food Drive' })
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByRole('heading', { name: 'Community Food Drive' })).toBe(title)
    expect(screen.queryByText('Loading campaign…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh campaign' }).disabled).toBe(true)
    await act(async () => finishRefresh({ campaign: { ...backendCampaigns[0], description: 'Updated description.' } }))
    expect(screen.getByRole('heading', { name: 'Community Food Drive' })).toBe(title)
    expect(screen.getByText('Updated description.')).toBeTruthy()
    expect(screen.getByText(/Last updated/).querySelector('time').getAttribute('datetime')).toBe('2026-09-30T12:00:30.000Z')
  })

  it('retains the last successful campaign on network failure and supports retry', async () => {
    const campaignLoader = vi.fn().mockResolvedValueOnce({ campaign: backendCampaigns[0] })
      .mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ campaign: backendCampaigns[0] })
    render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    await act(async () => {})
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByRole('heading', { name: 'Community Food Drive' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Showing the last loaded campaign')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry updates' })))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(campaignLoader).toHaveBeenCalledTimes(3)
  })

  it.each([{ code: 'NOT_FOUND' }, { status: 404 }])('removes stale public content when it becomes unavailable: %j', async (failure) => {
    const campaignLoader = vi.fn().mockResolvedValueOnce({ campaign: backendCampaigns[0] }).mockRejectedValueOnce(failure)
    render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    await act(async () => {})
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByRole('heading', { name: 'Campaign not found' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Community Food Drive' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Campaign information' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh campaign' })).toBeNull()
  })

  it('ignores the old campaign’s refresh when navigating to a different ID', async () => {
    let finishOld
    const campaignLoader = vi.fn().mockResolvedValueOnce({ campaign: backendCampaigns[0] })
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValueOnce({ campaign: backendCampaigns[1] })
    const { rerender } = render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    await act(async () => {})
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    const oldSignal = campaignLoader.mock.calls[1][1].signal
    rerender(<CampaignDetailsPage campaignId="1" campaignLoader={campaignLoader} />)
    await act(async () => {})
    expect(oldSignal.aborted).toBe(true)
    expect(screen.getByRole('heading', { name: 'Zero-Waste Week' })).toBeTruthy()
    await act(async () => finishOld({ campaign: backendCampaigns[0] }))
    expect(screen.queryByRole('heading', { name: 'Community Food Drive' })).toBeNull()
  })
})

describe('CauseConnect campaign details', () => {
  it('renders the campaign selected from the homepage without Stage 3 actions', async () => {
    render(<App pathname="/campaigns/1" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Zero-Waste Week' })).toBeTruthy()
    expect(screen.getAllByText('Environment')).toHaveLength(2)
    expect(screen.getByText('A week of zero-waste practices.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Campaign information' })).toBeTruthy()
    expect(screen.queryByText('Campaign type')).toBeNull()
    expect(screen.queryByText('Small business')).toBeNull()
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
        imageUrl: '/campaign-placeholder.svg',
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

  it('shows supplied type, dates, audience and business information', async () => {
    const campaignLoader = vi.fn().mockResolvedValue({ campaign: {
      ...backendCampaigns[0], type: 'business', startDate: '2026-10-10', endDate: '2026-10-20',
      targetAudience: 'Local families', business: { id: 2, businessName: 'Green Leaf Cafe' },
    } })
    render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    await screen.findByText('Community Food Drive')
    expect(screen.getByText('Small business')).toBeTruthy()
    expect(screen.getByText('Green Leaf Cafe')).toBeTruthy()
    expect(screen.getByText('10 October 2026')).toBeTruthy()
    expect(screen.getByText('20 October 2026')).toBeTruthy()
    expect(screen.getByText('Local families')).toBeTruthy()
  })

  it('does not expose a pending campaign even if a public API returns it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...backendCampaigns[0], status: 'pending' }), { status: 200 })))
    await expect(getCampaignById('3')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('treats a malformed details response as an error rather than a found campaign', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 3, status: 'approved' }), { status: 200 })))
    await expect(getCampaignById('3')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('rejects a response for another campaign and invalid IDs', async () => {
    await expect(getCampaignById('../admin')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fetch).not.toHaveBeenCalled()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(backendCampaigns[0]), { status: 200 })))
    await expect(getCampaignById('1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('handles an invalid optional date without crashing and hides unknown campaign types', async () => {
    const campaignLoader = vi.fn().mockResolvedValue({ campaign: { ...backendCampaigns[0], type: 'unknown', createdAt: 'invalid-date' } })
    render(<CampaignDetailsPage campaignId="3" campaignLoader={campaignLoader} />)
    await screen.findByText('Community Food Drive')
    expect(screen.getByText('Not provided')).toBeTruthy()
    expect(screen.queryByText('Campaign type')).toBeNull()
  })
})
