const mockCampaigns = [
  {
    id: 'clean-water-initiative',
    title: 'Clean Water Initiative',
    description: 'Supporting community access to clean and safe drinking water.',
    category: 'Environment',
    type: 'cause',
    imageUrl: '/images/campaigns/clean-water-initiative.jpg',
    status: 'approved',
    createdAt: '2026-08-21T06:00:00Z',
  },
  {
    id: 'community-food-drive',
    title: 'Community Food Drive',
    description: 'Collecting pantry essentials for local households that need support.',
    category: 'Community',
    type: 'cause',
    imageUrl: '/images/campaigns/community-food-drive.jpg',
    status: 'approved',
    createdAt: '2026-08-19T04:30:00Z',
  },
  {
    id: 'digital-skills-workshops',
    title: 'Digital Skills Workshops',
    description: 'Free practical sessions helping people use everyday online services safely.',
    category: 'Education',
    type: 'cause',
    imageUrl: '/images/campaigns/digital-skills-workshops.jpg',
    status: 'approved',
    createdAt: '2026-08-17T02:15:00Z',
  },
]

export class CampaignRequestError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CampaignRequestError'
    this.code = code
  }
}

export function selectPublicCampaigns(campaigns) {
  return campaigns
    .filter(({ status }) => status === 'approved')
    .toSorted((left, right) => (
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
    ))
}

export async function listCampaigns({ signal } = {}) {
  await Promise.resolve()

  if (signal?.aborted) {
    throw new CampaignRequestError('ABORTED', 'The campaign request was cancelled.')
  }

  const items = selectPublicCampaigns(mockCampaigns)

  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
  }
}
