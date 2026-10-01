import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CampaignImageInput, { validateCampaignImage } from './CampaignImageInput.jsx'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Campaign photo input', () => {
  it('accepts JPG, PNG and WebP up to 5 MB but rejects empty, oversized and unsupported files', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(validateCampaignImage({ type, size: 5000000 })).toBe('')
    expect(validateCampaignImage({ type: 'image/png', size: 5000001 })).toMatch(/5 MB/)
    expect(validateCampaignImage({ type: 'image/png', size: 0 })).toMatch(/empty/)
    expect(validateCampaignImage({ type: 'image/svg+xml', size: 1 })).toMatch(/JPG, PNG or WebP/)
  })

  it('previews the selected image, removes it, and releases its object URL', () => {
    const create = vi.fn().mockReturnValue('blob:test-photo')
    const revoke = vi.fn()
    const previousCreate = URL.createObjectURL
    const previousRevoke = URL.revokeObjectURL
    URL.createObjectURL = create
    URL.revokeObjectURL = revoke
    const onChange = vi.fn()
    const file = new File(['photo'], 'garden.png', { type: 'image/png' })
    const view = render(<CampaignImageInput file={file} onChange={onChange} />)
    expect(screen.getByAltText('Selected campaign photo preview').getAttribute('src')).toBe('blob:test-photo')
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(onChange).toHaveBeenCalledWith(null)
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:test-photo')
    URL.createObjectURL = previousCreate
    URL.revokeObjectURL = previousRevoke
  })
})
