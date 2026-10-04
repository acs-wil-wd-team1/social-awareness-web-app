import { useEffect, useRef, useState } from 'react'
import AdminActionDialog from '../components/AdminActionDialog.jsx'
import { changeUserStatus, loadAdminUsers } from '../services/adminUserService.js'
import { formatCampaignDate } from '../services/campaignManagementService.js'
import '../styles/campaign-management.css'
import '../styles/admin-management.css'

const roleLabels = { public: 'Community member', business_owner: 'Business owner', admin: 'Administrator' }

export default function AdminUsersPage({ token, role, currentUserId, userLoader = loadAdminUsers, statusSender = changeUserStatus }) {
  const [result, setResult] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [reloadRequired, setReloadRequired] = useState(false)
  const mutation = useRef(null)
  const saveLock = useRef(false)

  useEffect(() => {
    if (!token || role !== 'admin') return undefined
    const controller = new AbortController()
    setState('loading'); setResult(null); setError(null)
    setSelected(null); setReloadRequired(false)
    userLoader({ token, signal: controller.signal, page, pageSize: 10, search, status })
      .then((data) => {
        if (controller.signal.aborted) return
        setResult(data); setState('success')
      }).catch((failure) => {
        if (controller.signal.aborted) return
        setError(failure); setState('error')
      })
    return () => controller.abort()
  }, [token, role, page, search, status, retry, userLoader])

  useEffect(() => {
    setNotice(''); setSaveError(''); setSaving(false); saveLock.current = false
    return () => { mutation.current?.abort(); saveLock.current = false }
  }, [token, role])

  async function saveStatus() {
    if (saveLock.current || reloadRequired || !selected || selected.role === 'admin' || selected.id === currentUserId) return
    saveLock.current = true
    const controller = new AbortController()
    mutation.current = controller
    const nextStatus = selected.status === 'active' ? 'suspended' : 'active'
    setSaving(true); setSaveError(''); setNotice('')
    try {
      const savedUser = await statusSender(selected.id, nextStatus, { token, signal: controller.signal })
      if (controller.signal.aborted) return
      setSelected(null)
      setNotice(`${savedUser.name}’s account is now ${savedUser.status === 'active' ? 'active. They can log in again.' : 'suspended. Their active sessions have been ended.'}`)
      setRetry((value) => value + 1)
    } catch (failure) {
      if (controller.signal.aborted) return
      setSelected(null)
      if (failure.status === 409) {
        setNotice('This account changed while you were reviewing it. Check the reloaded account list before trying again.')
        setRetry((value) => value + 1)
      } else if ([401, 403, 404].includes(failure.status)) {
        setError(failure); setState('error')
      } else if (failure.status === 422) {
        setSaveError(failure.fieldErrors?.status || 'The account change was not accepted. Reload the account list and try again.')
      } else {
        setSaveError('We could not confirm whether the account status changed. Reload the account list before trying again.')
        setReloadRequired(true)
      }
    } finally {
      if (!controller.signal.aborted) { setSaving(false); saveLock.current = false }
    }
  }

  if (!token || role !== 'admin') return (
    <section className="campaign-management content-width"><h1>{token ? 'Admin access required' : 'Log in to manage accounts'}</h1>
      <p>Account management is available to administrators.</p>
      <a className="text-link" href={token ? '/' : '/login?returnTo=%2Fadmin%2Fusers'}>{token ? 'Back to home' : 'Log in'}</a>
    </section>
  )

  return (
    <section className="campaign-management content-width" aria-labelledby="admin-users-title">
      <a className="back-link" href="/admin/campaigns">← Campaign management</a>
      <header className="campaign-management__heading"><p className="campaign-management__eyebrow">Administration</p>
        <h1 id="admin-users-title">Manage accounts</h1><p>Find community members and business owners, and manage their account access.</p>
      </header>
      <form className="campaign-management__filters" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1) }}>
        <div><label htmlFor="admin-user-search">Search accounts</label><input id="admin-user-search" type="search" placeholder="Search by name or email" maxLength={150} value={searchInput} disabled={saving} onChange={(event) => setSearchInput(event.target.value)} /></div>
        <div><label htmlFor="admin-user-status">Account status</label><select id="admin-user-status" value={status} disabled={saving} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
          <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select></div>
        <button type="submit" disabled={saving}>Search</button>
      </form>
      {notice ? <p className="campaign-management__notice" role="status">{notice}</p> : null}
      {saveError ? <p className="campaign-management__error" role="alert">{saveError}</p> : null}
      {reloadRequired ? <button type="button" onClick={() => { setSaveError(''); setRetry((value) => value + 1) }}>Reload account list</button> : null}
      {state === 'loading' ? <p role="status">Loading accounts…</p> : null}
      {state === 'error' ? <div className="campaign-management__notice" role="alert">
        <p>{error?.status === 401 ? 'Your session has expired. Please log in again.' : error?.status === 403 ? 'Your account does not have permission to manage users.' : error?.status === 404 ? 'The account or account-management service is unavailable.' : 'Accounts could not be loaded. Please try again.'}</p>
        {error?.status === 401 ? <a className="text-link" href="/login?returnTo=%2Fadmin%2Fusers">Log in again</a> : error?.status !== 403 ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button> : null}
      </div> : null}
      {state === 'success' && result ? <>
        <p role="status">{result.users.length ? `${result.users.length} ${result.users.length === 1 ? 'account' : 'accounts'} on page ${result.page}` : 'No accounts found.'}</p>
        <ul className="campaign-management__list admin-user-list">{result.users.map((user) => <li key={user.id} className="campaign-management__card">
          <div className="campaign-management__card-top"><span className={`account-status account-status--${user.status}`}>{user.status}</span><span className="campaign-management__meta">Account #{user.id}</span></div>
          <h2>{user.name}</h2><p className="admin-user-email">{user.email}</p>
          <dl className="campaign-management__facts"><div><dt>Account type</dt><dd>{roleLabels[user.role]}</dd></div><div><dt>Joined</dt><dd>{formatCampaignDate(user.createdAt)}</dd></div></dl>
          {user.role === 'admin' || user.id === currentUserId ? <p className="campaign-management__meta">Protected administrator account. Its role and access cannot be changed here.</p>
            : <button type="button" disabled={saving || reloadRequired} onClick={() => { setSelected(user); setSaveError('') }}>{user.status === 'active' ? 'Suspend account' : 'Reactivate account'}<span className="visually-hidden">: {user.name}</span></button>}
        </li>)}</ul>
      </> : null}
      <nav className="campaign-management__pagination" aria-label="Account pages">
        <button type="button" disabled={page <= 1 || state === 'loading' || saving} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span>
        <button type="button" disabled={state !== 'success' || !result || result.page * result.pageSize >= result.total || saving} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
      {selected ? <AdminActionDialog title={selected.status === 'active' ? 'Suspend this account?' : 'Reactivate this account?'} busy={saving}
        confirmLabel={selected.status === 'active' ? 'Confirm suspension' : 'Confirm reactivation'} onCancel={() => setSelected(null)} onConfirm={saveStatus}>
        <p><strong>{selected.name}</strong> · Account #{selected.id}<br />{selected.email}</p>
        <p>{selected.status === 'active' ? 'They will be unable to log in, and all their active sessions will end. Their campaigns and records will be retained.' : 'They will be allowed to log in again. Previously ended sessions will stay ended.'}</p>
      </AdminActionDialog> : null}
    </section>
  )
}
