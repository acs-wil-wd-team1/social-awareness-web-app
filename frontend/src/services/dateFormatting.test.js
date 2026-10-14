import { describe, expect, it } from 'vitest'
import { formatDisplayDate, formatDisplayTimestamp } from './dateFormatting.js'
import { formatCampaignDate } from './campaignManagementService.js'
import { formatEngagementDate } from './engagementService.js'

describe('Date display', () => {
  it.each(['Australia/Sydney', 'America/Los_Angeles'])('keeps calendar dates unchanged in %s', timeZone => {
    expect(formatDisplayDate('2026-10-14', { timeZone })).toBe('14 October 2026')
    expect(formatCampaignDate('2026-10-14', { timeZone })).toBe('14 October 2026')
  })

  it.each([
    ['Australia/Sydney', '15 October 2026'], ['America/Los_Angeles', '14 October 2026'],
  ])('displays actual timestamps in %s rather than UTC', (timeZone, expected) => {
    const value = '2026-10-14T23:30:00.000Z'
    expect(formatDisplayDate(value, { timeZone })).toBe(expected)
    expect(formatCampaignDate(value, { timeZone })).toBe(expected)
    expect(formatEngagementDate(value, { timeZone })).toBe(expected)
    expect(formatDisplayTimestamp(value, { timeZone })).toBe(new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium', timeStyle: 'short', timeZone,
    }).format(new Date(value)))
  })

  it('uses the runtime time zone when no test or caller override is supplied', () => {
    const value = '2026-10-14T23:30:00.000Z'
    expect(formatDisplayDate(value)).toBe(new Intl.DateTimeFormat('en-AU', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(value)))
  })

  it.each([undefined, null, '', 'invalid'])('handles unavailable values without throwing: %s', value => {
    expect(formatDisplayDate(value)).toBe('Not available')
    expect(formatDisplayTimestamp(value)).toBe('Not available')
    expect(formatDisplayDate(value, { fallback: 'Not provided' })).toBe('Not provided')
  })
})
