export class CampaignSubmissionError extends Error {
  constructor(code, message, { status = 0, fieldErrors = {} } = {}) {
    super(message)
    this.name = 'CampaignSubmissionError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function invalidResponse(isSubmission = false) {
  return new CampaignSubmissionError('INVALID_RESPONSE', isSubmission
    ? 'The server did not confirm the saved campaign. It may have been created; please check before submitting again.'
    : 'The category response could not be read. Please try again.')
}

async function request(url, options, isSubmission = false) {
  let response
  try {
    response = await fetch(url, options)
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new CampaignSubmissionError('ABORTED', 'The request was cancelled.')
    }
    throw new CampaignSubmissionError('NETWORK_ERROR', isSubmission
      ? 'The connection was interrupted. We could not confirm whether your campaign was saved; please check before submitting again.'
      : 'Categories could not be loaded. Check your connection and try again.')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const fields = body?.fieldErrors
    const fieldErrors = fields && typeof fields === 'object' && !Array.isArray(fields)
      ? Object.fromEntries(Object.entries(fields).filter(([, message]) => typeof message === 'string'))
      : {}
    const serverMessage = typeof body?.message === 'string' ? body.message
      : typeof body?.error === 'string' ? body.error : null
    throw new CampaignSubmissionError(body?.code || 'REQUEST_FAILED', serverMessage || (
      response.status === 401 ? 'Your session has expired. Please log in again.'
        : response.status === 403 ? 'Your account cannot submit a campaign.'
          : 'The request failed. Please try again.'
    ), { status: response.status, fieldErrors })
  }
  return { response, body }
}

export async function loadCampaignCategories({ signal } = {}) {
  const { response, body } = await request('/api/campaigns/categories', { signal })
  const categories = body?.categories
  if (response.status !== 200 || !Array.isArray(categories) || categories.some((category) => (
    !Number.isSafeInteger(category?.id) || category.id < 1
    || typeof category.name !== 'string' || !category.name.trim()
  )) || new Set(categories.map(({ id }) => id)).size !== categories.length) {
    throw invalidResponse()
  }
  return categories.map(({ id, name }) => ({ id, name }))
}

export async function submitCampaign(payload, { token, signal } = {}) {
  if (!token) {
    throw new CampaignSubmissionError('AUTH_REQUIRED', 'Log in before submitting a campaign.', { status: 401 })
  }
  const { response, body } = await request('/api/campaigns', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  }, true)
  const campaign = body?.campaign
  if (response.status !== 201 || !Number.isSafeInteger(campaign?.id) || campaign.id < 1
    || typeof campaign.title !== 'string' || !campaign.title.trim() || campaign.status !== 'pending') {
    throw invalidResponse(true)
  }
  return campaign
}
