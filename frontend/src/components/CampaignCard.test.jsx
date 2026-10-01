import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import CampaignCard from './CampaignCard.jsx'

afterEach(cleanup)

it('recovers when a refreshed image URL replaces a failed photo and fallback', () => {
  const campaign = { id: 1, title: 'Community garden', description: 'Plant together.', category: 'Environment', imageUrl: '/photo-old.jpg' }
  const { container, rerender } = render(<CampaignCard campaign={campaign} />)
  const oldImage = container.querySelector('img')
  fireEvent.error(oldImage)
  expect(oldImage.getAttribute('src')).toBe('/campaign-placeholder.svg')
  fireEvent.error(oldImage)
  expect(oldImage.hidden).toBe(true)

  rerender(<CampaignCard campaign={{ ...campaign, imageUrl: '/photo-new.jpg' }} />)
  const refreshedImage = container.querySelector('img')
  expect(refreshedImage.getAttribute('src')).toBe('/photo-new.jpg')
  expect(refreshedImage.hidden).toBe(false)
  expect(refreshedImage.dataset.fallback).toBeUndefined()
  fireEvent.error(refreshedImage)
  expect(refreshedImage.getAttribute('src')).toBe('/campaign-placeholder.svg')
  expect(refreshedImage.hidden).toBe(false)
})
