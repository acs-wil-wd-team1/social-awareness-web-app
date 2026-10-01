import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminUsersPage from './AdminUsersPage.jsx'

const member = { id: 4, name: 'Alex', email: 'alex@example.test', role: 'public', status: 'active' }
const admin = { id: 1, name: 'Admin', email: 'admin@example.test', role: 'admin', status: 'active' }
const result = { users: [member, admin], page: 1, pageSize: 10, total: 2 }
function setup({ loader = vi.fn().mockResolvedValue(result), sender = vi.fn(), currentUserId = 1 } = {}) {
  render(<AdminUsersPage token="a" role="admin" currentUserId={currentUserId} userLoader={loader} statusSender={sender} />)
  return { loader, sender }
}
afterEach(cleanup)

describe('administrator account management', () => {
  it('blocks non-admin users before any account request', () => {
    const loader = vi.fn()
    render(<AdminUsersPage token="a" role="public" userLoader={loader} />)
    expect(screen.getByText('Admin access required')).toBeTruthy()
    expect(loader).not.toHaveBeenCalled()
  })
  it('protects every administrator and the signed-in account; has no role editor', async () => {
    setup({ currentUserId: 4 })
    await screen.findByText('Alex')
    expect(screen.queryByRole('button', { name: /Suspend account/ })).toBeNull()
    expect(screen.queryByLabelText(/role/i)).toBeNull()
  })
  it('requires confirmation to suspend and describes session revocation', async () => {
    const sender = vi.fn().mockResolvedValue({ ...member, status: 'suspended' })
    const loader = vi.fn().mockResolvedValueOnce(result).mockResolvedValue({ ...result, users: [{ ...member, status: 'suspended' }, admin] })
    setup({ loader, sender })
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend account: Alex' }))
    const dialog = screen.getByRole('dialog', { name: 'Suspend this account?' })
    expect(within(dialog).getByText(/all their active sessions will end/)).toBeTruthy()
    expect(sender).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm suspension' }))
    await screen.findByText(/Alex’s account is now suspended/)
    expect(sender).toHaveBeenCalledWith(4, 'suspended', expect.objectContaining({ token: 'a' }))
    expect(await screen.findByRole('button', { name: 'Reactivate account: Alex' })).toBeTruthy()
  })
  it('cancels with Escape and restores focus to the original action', async () => {
    const { sender } = setup()
    const button = await screen.findByRole('button', { name: 'Suspend account: Alex' })
    button.focus(); fireEvent.click(button)
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(sender).not.toHaveBeenCalled()
  })
  it('blocks duplicate saves and requires a reload after an uncertain result', async () => {
    let reject
    const sender = vi.fn(() => new Promise((resolve, rejectPromise) => { reject = rejectPromise }))
    setup({ sender })
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend account: Alex' }))
    const confirm = screen.getByRole('button', { name: 'Confirm suspension' })
    fireEvent.click(confirm); fireEvent.click(confirm)
    expect(sender).toHaveBeenCalledTimes(1)
    reject(new Error('Disconnected'))
    await screen.findByRole('button', { name: 'Reload account list' })
    expect(screen.getByRole('button', { name: 'Suspend account: Alex' }).disabled).toBe(true)
    expect(screen.queryByText(/account is now suspended/)).toBeNull()
  })
  it('reloads account conflicts without showing a success message', async () => {
    const sender = vi.fn().mockRejectedValue({ status: 409 })
    const { loader } = setup({ sender })
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend account: Alex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm suspension' }))
    await screen.findByText(/account changed while you were reviewing/)
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/account is now suspended/)).toBeNull()
  })
  it('filters from page one and offers reauthentication after a 401', async () => {
    const loader = vi.fn().mockResolvedValueOnce(result).mockRejectedValue({ status: 401 })
    setup({ loader })
    await screen.findByText('Alex')
    fireEvent.change(screen.getByLabelText('Account status'), { target: { value: 'suspended' } })
    await screen.findByRole('link', { name: 'Log in again' })
    expect(loader).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'suspended' }))
  })
})
