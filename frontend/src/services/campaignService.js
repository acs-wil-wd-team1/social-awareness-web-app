export class CampaignRequestError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CampaignRequestError'
    this.code = code
  }
}

const seededCampaignPresentation = {
  'Books for Kids': {
    imageUrl: '/images/campaigns/books-for-kids.jpg',
    type: 'cause',
  },
  'Community Food Drive': {
    imageUrl: '/images/campaigns/community-food-drive.jpg',
    type: 'cause',
  },
  'Mindful Mornings': {
    imageUrl: '/images/campaigns/mindful-mornings.jpg',
    type: 'business',
  },
  'Zero-Waste Week': {
    imageUrl: '/images/campaigns/zero-waste-week.jpg',
    type: 'business',
  },
}

function normalizeCampaign(campaign) {
  const presentation = seededCampaignPresentation[campaign.title] ?? {}

  return {
    ...campaign,
    id: String(campaign.id),
    imageUrl: campaign.imageUrl || presentation.imageUrl || '/campaign-placeholder.svg',
    type: campaign.type ?? presentation.type ?? null,
  }
}

async function readJson(response) {
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new CampaignRequestError(
      response.status === 404 ? 'NOT_FOUND' : (body?.code ?? 'REQUEST_FAILED'),
      body?.message ?? 'The campaign request failed.',
    )
  }

  return body
}

export function selectPublicCampaigns(campaigns) {
  return campaigns
    .filter(({ status }) => status === 'approved')
    .map(normalizeCampaign)
    .toSorted((left, right) => (
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
    ))
}

export async function listCampaigns({ signal } = {}) {
  let response

  try {
    response = await fetch('/api/campaigns?page=1&pageSize=100', { signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new CampaignRequestError('ABORTED', 'The campaign request was cancelled.')
    }

    throw new CampaignRequestError('NETWORK_ERROR', 'The campaign API could not be reached.')
  }

  const body = await readJson(response)
  const items = selectPublicCampaigns(Array.isArray(body?.campaigns) ? body.campaigns : [])

  return {
    items,
    page: body?.page ?? 1,
    pageSize: body?.pageSize ?? items.length,
    total: body?.total ?? items.length,
  }
}

export async function getCampaignById(id, { signal } = {}) {
  let response

  try {
    response = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new CampaignRequestError('ABORTED', 'The campaign request was cancelled.')
    }

    throw new CampaignRequestError('NETWORK_ERROR', 'The campaign API could not be reached.')
  }

  const body = await readJson(response)
  const campaign = body?.campaign ?? body

  if (!campaign?.id) {
    throw new CampaignRequestError('NOT_FOUND', 'The campaign could not be found.')
  }

  return { campaign: normalizeCampaign(campaign) }
}
