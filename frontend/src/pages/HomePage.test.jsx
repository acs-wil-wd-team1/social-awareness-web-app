import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => Promise.resolve(new Response(JSON.stringify(String(url).includes('/categories') ? {
    categories: [{ id: 1, name: 'Community support' }, { id: 2, name: 'Education' }],
  } : {
    campaigns: backendCampaigns,
    page: 1,
    pageSize: 20,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))))
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('campaign list background refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  const response = (items = backendCampaigns) => ({ items, page: 1, pageSize: 20, hasNext: false })
  const categoryLoader = async () => [{ id: 2, name: 'Education' }]

  it('keeps cards and unsubmitted search text during automatic refresh', async () => {
    let finishRefresh
    const campaignLoader = vi.fn().mockResolvedValueOnce(response())
      .mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
    render(<HomePage campaignLoader={campaignLoader} categoryLoader={categoryLoader} />)
    await act(async () => {})
    const title = screen.getByRole('heading', { name: 'Books for Kids' })
    fireEvent.change(screen.getByLabelText('Find a campaign'), { target: { value: 'unfinished search' } })
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByRole('heading', { name: 'Books for Kids' })).toBe(title)
    expect(screen.getByText('Checking for campaign updates…')).toBeTruthy()
    expect(screen.queryByText('Loading campaigns…')).toBeNull()
    expect(screen.getByLabelText('Find a campaign').value).toBe('unfinished search')
    await act(async () => finishRefresh(response([{ ...backendCampaigns[0], description: 'Updated campaign description.' }])))
    expect(screen.getByText('Updated campaign description.')).toBeTruthy()
    expect(screen.getByLabelText('Find a campaign').value).toBe('unfinished search')
    expect(screen.getByText(/Last updated/).querySelector('time').getAttribute('datetime')).toBe('2026-09-30T12:00:30.000Z')
  })

  it('keeps the last successful list after refresh failure and retries from the notice', async () => {
    const campaignLoader = vi.fn().mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(response([{ ...backendCampaigns[0], title: 'Recovered list' }]))
    render(<HomePage campaignLoader={campaignLoader} categoryLoader={categoryLoader} />)
    await act(async () => {})
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    expect(screen.getByRole('heading', { name: 'Books for Kids' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Showing the last loaded campaigns')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry updates' })))
    expect(screen.getByRole('heading', { name: 'Recovered list' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not let a previous filter’s background response replace the new search', async () => {
    let finishOld
    const campaignLoader = vi.fn().mockResolvedValueOnce(response())
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValueOnce(response([]))
    render(<HomePage campaignLoader={campaignLoader} categoryLoader={categoryLoader} />)
    await act(async () => {})
    await act(async () => vi.advanceTimersByTimeAsync(30000))
    const oldSignal = campaignLoader.mock.calls[1][0].signal
    fireEvent.change(screen.getByLabelText('Find a campaign'), { target: { value: 'No result' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Search' })))
    expect(oldSignal.aborted).toBe(true)
    expect(screen.getByText('No matching campaigns')).toBeTruthy()
    await act(async () => finishOld(response()))
    expect(screen.queryByRole('heading', { name: 'Books for Kids' })).toBeNull()
    expect(screen.getByText('No matching campaigns')).toBeTruthy()
  })
})

describe('CauseConnect campaign homepage', () => {
  it.each([
    [undefined, undefined, 'Create an account', '/register'],
    ['public-token', 'public', 'Start a campaign', '/campaigns/new'],
    ['business-token', 'business_owner', 'Start a campaign', '/business/campaigns/new'],
    ['admin-token', 'admin', 'Review campaigns', '/admin/campaigns'],
  ])('offers a useful next action for the %s session', async (token, role, label, href) => {
    render(<HomePage token={token} role={role} />)
    expect(screen.getByRole('link', { name: 'Explore campaigns' }).getAttribute('href')).toBe('#campaigns')
    expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(href)
    expect(await screen.findByRole('heading', { name: 'Books for Kids' })).toBeTruthy()
  })

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
    expect(screen.getByText('4 campaigns on page 1')).toBeTruthy()
  })

  it('maps the backend campaign response to the frontend list shape', async () => {
    const response = await listCampaigns()

    expect(response).toMatchObject({ page: 1, pageSize: 20, hasNext: false })
    expect(response.total).toBeUndefined()
    expect(response.items.every(({ status }) => status === 'approved')).toBe(true)
    expect(response.items.map(({ title, imageUrl, type }) => ({ title, imageUrl, type }))).toEqual([
      {
        title: 'Books for Kids',
        imageUrl: '/campaign-placeholder.svg',
        type: null,
      },
      {
        title: 'Community Food Drive',
        imageUrl: '/campaign-placeholder.svg',
        type: null,
      },
      {
        title: 'Mindful Mornings',
        imageUrl: '/campaign-placeholder.svg',
        type: null,
      },
      {
        title: 'Zero-Waste Week',
        imageUrl: '/campaign-placeholder.svg',
        type: null,
      },
    ])
    expect(fetch).toHaveBeenCalledWith('/api/campaigns?page=1&pageSize=20', expect.any(Object))
  })

  it('uses only the image and type actually returned by the API', () => {
    const [campaign] = selectPublicCampaigns([{
      ...backendCampaigns[0],
      imageUrl: 'https://example.com/books.jpg',
      type: 'business',
    }])

    expect(campaign.imageUrl).toBe('https://example.com/books.jpg')
    expect(campaign.type).toBe('business')
  })

  it('filters hidden campaigns and preserves server ordering for numeric ID ties', () => {
    const campaigns = [
      { ...backendCampaigns[0], id: 10, createdAt: '2026-08-21T06:00:00Z' },
      { ...backendCampaigns[0], id: 9, createdAt: '2026-08-21T06:00:00Z' },
      { ...backendCampaigns[0], id: 11, status: 'pending', createdAt: '2026-08-22T06:00:00Z' },
    ]

    expect(selectPublicCampaigns(campaigns).map(({ id }) => id)).toEqual(['10', '9'])
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

  it('fetches subsequent pages and resets to page one when searching', async () => {
    const campaignLoader = vi.fn()
      .mockResolvedValueOnce({ items: backendCampaigns, page: 1, pageSize: 4, hasNext: true })
      .mockResolvedValueOnce({ items: [{ ...backendCampaigns[0], title: 'Another campaign' }], page: 2, pageSize: 4, hasNext: false })
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, hasNext: false })
    render(<HomePage campaignLoader={campaignLoader} />)
    await screen.findByText('Books for Kids')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Another campaign')
    expect(campaignLoader).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }))
    fireEvent.change(screen.getByLabelText('Find a campaign'), { target: { value: '  Books & schools  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('No matching campaigns')
    expect(campaignLoader).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'Books & schools' }))
    expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true)
  })

  it('uses category IDs and clears filters without requiring every campaign to be loaded', async () => {
    const campaignLoader = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, hasNext: false })
    render(<HomePage campaignLoader={campaignLoader} />)
    await screen.findByRole('option', { name: 'Education' })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '2' } })
    await waitFor(() => expect(campaignLoader).toHaveBeenLastCalledWith(expect.objectContaining({ category: '2', page: 1 })))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(campaignLoader).toHaveBeenLastCalledWith(expect.objectContaining({ category: '', search: '' })))
  })

  it('encodes search and category in the actual API request', async () => {
    await listCampaigns({ page: 6, search: 'Books & schools', category: 2 })
    const url = new URL(fetch.mock.calls[0][0], 'https://example.test')
    expect(url.searchParams.get('page')).toBe('6')
    expect(url.searchParams.get('search')).toBe('Books & schools')
    expect(url.searchParams.get('category')).toBe('2')
  })

  it('reports malformed API responses as errors, not an empty campaign list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 })))
    await expect(listCampaigns()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('continues browsing when categories fail and can retry just the categories', async () => {
    const categoryLoader = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([{ id: 2, name: 'Education' }])
    const campaignLoader = vi.fn().mockResolvedValue({ items: backendCampaigns, page: 1, pageSize: 20, hasNext: false })
    render(<HomePage campaignLoader={campaignLoader} categoryLoader={categoryLoader} />)
    await screen.findByText('Books for Kids')
    fireEvent.click(await screen.findByRole('button', { name: 'Retry categories' }))
    await screen.findByRole('option', { name: 'Education' })
    expect(campaignLoader).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale response after a search has changed', async () => {
    let finishOld
    const campaignLoader = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, hasNext: false })
    render(<HomePage campaignLoader={campaignLoader} />)
    fireEvent.change(screen.getByLabelText('Find a campaign'), { target: { value: 'Not found' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('No matching campaigns')
    finishOld({ items: backendCampaigns, page: 1, pageSize: 20 })
    await waitFor(() => expect(screen.queryByText('Books for Kids')).toBeNull())
  })
})
