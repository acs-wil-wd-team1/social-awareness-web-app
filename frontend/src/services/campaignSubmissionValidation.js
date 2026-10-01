function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateCampaignSubmission(values, categories) {
  const errors = {}
  if (!values.title.trim()) errors.title = 'Title is required.'
  else if (values.title.trim().length > 150) errors.title = 'Use 150 characters or fewer.'
  if (!values.description.trim()) errors.description = 'Description is required.'
  else if (values.description.trim().length > 5000) errors.description = 'Use 5,000 characters or fewer.'
  const categoryId = Number(values.categoryId)
  if (!Number.isSafeInteger(categoryId) || categoryId < 1 || !categories.some(({ id }) => id === categoryId)) {
    errors.categoryId = 'Choose an available category.'
  }
  if (values.targetAudience.trim().length > 255) errors.targetAudience = 'Use 255 characters or fewer.'
  if (!values.startDate) errors.startDate = 'Start date is required.'
  else if (!validDate(values.startDate)) errors.startDate = 'Enter a valid date from year 1000 onwards.'
  if (!values.endDate) errors.endDate = 'End date is required.'
  else if (!validDate(values.endDate)) errors.endDate = 'Enter a valid date from year 1000 onwards.'
  if (!errors.startDate && !errors.endDate && values.endDate < values.startDate) {
    errors.endDate = 'End date must be on or after the start date.'
  }
  return errors
}
