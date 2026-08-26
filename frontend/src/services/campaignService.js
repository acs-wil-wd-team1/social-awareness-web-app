const mockCampaigns = [
  {
    id: 'clean-water-initiative',
    title: 'Clean Water Initiative',
    description: 'Supporting community access to clean and safe drinking water.',
    details: 'Access to safe drinking water is not equal in every community. This campaign focuses attention on practical local projects that improve water access and help people use and store water safely.',
    goals: [
      'Raise awareness of barriers to safe drinking water.',
      'Support practical community water initiatives.',
      'Share clear information about safer water use.',
    ],
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
    details: 'Households can face short periods when groceries and everyday essentials are difficult to afford. This campaign helps local groups coordinate useful donations and direct them to people who need support.',
    goals: [
      'Collect useful pantry staples and household essentials.',
      'Connect local donations with households needing support.',
      'Encourage ongoing community involvement.',
    ],
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
    details: 'Everyday services increasingly require people to go online. This campaign promotes friendly, practical sessions where participants can learn at their own pace and ask questions about common digital tasks.',
    goals: [
      'Build confidence using everyday online services.',
      'Promote safer digital habits.',
      'Make practical technology help easier to access.',
    ],
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

export async function getCampaignById(id, { signal } = {}) {
  await Promise.resolve()

  if (signal?.aborted) {
    throw new CampaignRequestError('ABORTED', 'The campaign request was cancelled.')
  }

  const campaign = selectPublicCampaigns(mockCampaigns)
    .find(({ id: campaignId }) => campaignId === id)

  if (!campaign) {
    throw new CampaignRequestError('NOT_FOUND', 'The campaign could not be found.')
  }

  return { campaign }
}
