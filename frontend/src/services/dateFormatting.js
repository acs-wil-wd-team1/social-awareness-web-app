const dateOnly = /^\d{4}-\d{2}-\d{2}$/

// Calendar dates are not instants: keep campaign start/end dates unchanged in
// every time zone. Actual timestamps use the viewer's zone unless one is given.
export function formatDisplayDate(value, { timeZone, fallback = 'Not available' } = {}) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fallback
  const zone = dateOnly.test(value) ? 'UTC' : timeZone
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', ...(zone ? { timeZone: zone } : {}),
  }).format(new Date(value))
}

export function formatDisplayTimestamp(value, { timeZone, fallback = 'Not available' } = {}) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fallback
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value))
}
