export const sampleCategories = [
  { id: 1, name: 'Environment' },
  { id: 2, name: 'Health & Wellbeing' },
  { id: 3, name: 'Community Support' },
  { id: 4, name: 'Education' },
]

export const sampleAccounts = {
  public: { label: 'Public user', type: 'cause' },
  business: { label: 'Business owner', type: 'business', businessName: 'Green Leaf Cafe' },
  'business-missing': { label: 'Business owner without a profile', type: 'business' },
  guest: { label: 'Guest' },
}

export const maxImageBytes = 5_000_000

export function validateDraftImage(file) {
  if (!file) return ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP image.'
  }
  if (file.size === 0) return 'Choose an image that is not empty.'
  if (file.size > maxImageBytes) return 'Choose an image no larger than 5 MB.'
  return ''
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateDraftCampaign(values) {
  const errors = {}
  if (!values.title.trim()) errors.title = 'Title is required.'
  else if (values.title.trim().length > 150) errors.title = 'Use 150 characters or fewer.'
  if (!values.description.trim()) errors.description = 'Description is required.'
  else if (values.description.trim().length > 5000) errors.description = 'Use 5,000 characters or fewer.'
  if (!sampleCategories.some(({ id }) => id === Number(values.categoryId))) errors.categoryId = 'Choose a category.'
  if (values.targetAudience.trim().length > 255) errors.targetAudience = 'Use 255 characters or fewer.'
  if (!values.startDate) errors.startDate = 'Start date is required.'
  else if (!isDate(values.startDate)) errors.startDate = 'Enter a valid start date.'
  if (!values.endDate) errors.endDate = 'End date is required.'
  else if (!isDate(values.endDate)) errors.endDate = 'Enter a valid end date.'
  if (!errors.startDate && !errors.endDate && values.endDate < values.startDate) {
    errors.endDate = 'End date must be on or after the start date.'
  }
  return errors
}

// An in-memory UI example. This function never calls an API or saves data.
export async function submitSampleCampaign(payload, { sampleAccount, simulateError }) {
  await new Promise((resolve) => setTimeout(resolve, 350))
  if (simulateError) throw new Error('Sample submission failed. Turn off the error preview and try again.')
  return { sampleOnly: true, campaign: { title: payload.title, type: sampleAccounts[sampleAccount].type, status: 'pending' } }
}
