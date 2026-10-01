import { useEffect, useState } from 'react'
import {
  CAMPAIGN_STATUSES, campaignListHasNext, formatCampaignDate,
  loadAdminCampaigns, managementErrorMessage,
} from '../services/campaignManagementService.js'
import '../styles/campaign-management.css'

export default function AdminCampaignsPage({ token, role, campaignLoader = loadAdminCampaigns }) {
  const [status, setStatus] = useState('pending')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const [requestState, setRequestState] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token || role !== 'admin') return undefined
    const controller = new AbortController()
    setRequestState('loading')
    setResult(null)
    setError(null)
    campaignLoader({ token, signal: controller.signal, page, pageSize: 10, status, search })
      .then((response) => {
        if (controller.signal.aborted) return
        setResult(response)
        setRequestState('success')
      })
      .catch((failure) => {
        if (controller.signal.aborted) return
        setError(failure)
        setRequestState('error')
      })
    return () => controller.abort()
  }, [token, role, page, status, search, retry, campaignLoader])

  if (!token || role !== 'admin') {
    return (
      <section className="campaign-management content-width">
        <h1>{!token ? 'Log in to review campaigns' : 'Admin access required'}</h1>
        <p>{!token ? 'Use an administrator account to continue.' : 'Campaign reviews are available to administrators.'}</p>
        <a className="text-link" href={!token ? '/login?returnTo=%2Fadmin%2Fcampaigns' : '/'}>{!token ? 'Log in' : 'Back to home'}</a>
      </section>
    )
  }

  return (
    <section className="campaign-management content-width" aria-labelledby="admin-campaigns-title">
      <header className="campaign-management__heading">
        <p className="campaign-management__eyebrow">Administration</p>
        <h1 id="admin-campaigns-title">Review campaigns</h1>
        <p>Check each submission before it appears publicly.</p>
      </header>

      <form className="campaign-management__filters" onSubmit={(event) => {
        event.preventDefault()
        setPage(1)
        setSearch(searchInput.trim())
      }}>
        <div>
          <label htmlFor="admin-campaign-search">Search campaigns</label>
          <input id="admin-campaign-search" type="search" value={searchInput} maxLength={200}
            onChange={(event) => setSearchInput(event.target.value)} placeholder="Search by title" />
        </div>
        <div>
          <label htmlFor="admin-campaign-status">Campaign status</label>
          <select id="admin-campaign-status" value={status} onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}>
            <option value="">All statuses</option>
            {CAMPAIGN_STATUSES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
        </div>
        <button type="submit">Search</button>
      </form>

      {requestState === 'loading' ? <p role="status">Loading campaigns…</p> : null}
      {requestState === 'error' ? (
        <div className="campaign-management__notice" role="alert">
          <p>{managementErrorMessage(error)}</p>
          {error?.status === 401 ? <a className="text-link" href="/login?returnTo=%2Fadmin%2Fcampaigns">Log in again</a>
            : error?.status !== 403 ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button> : null}
        </div>
      ) : null}
      {requestState === 'success' && result ? (
        <>
          <p className="campaign-management__count" role="status">
            {result.campaigns.length ? `${result.campaigns.length} campaign${result.campaigns.length === 1 ? '' : 's'} on page ${result.page}` : 'No campaigns found.'}
          </p>
          {!result.campaigns.length ? <p>{status === 'pending' && !search ? 'There are no pending campaigns on this page.' : 'Try a different status or search.'}</p> : (
            <ul className="campaign-management__list">
              {result.campaigns.map((campaign) => (
                <li key={campaign.id} className="campaign-management__card">
                  <div className="campaign-management__card-top">
                    <span className={`campaign-status campaign-status--${campaign.status}`}>{campaign.status}</span>
                    <span className="campaign-management__meta">Submitted {formatCampaignDate(campaign.createdAt)}</span>
                  </div>
                  <h2><a href={`/admin/campaigns/${campaign.id}`}>{campaign.title}</a></h2>
                  <p className="campaign-management__excerpt">{campaign.description}</p>
                  <p className="campaign-management__meta">{campaign.category || 'Uncategorised'} · Campaign #{campaign.id}</p>
                  <a className="text-link" href={`/admin/campaigns/${campaign.id}`}>
                    {campaign.status === 'pending' ? 'Review submission' : 'View submission'}<span className="visually-hidden">: {campaign.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      <nav className="campaign-management__pagination" aria-label="Campaign pages">
        <button type="button" disabled={page <= 1 || requestState === 'loading'} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>Page {page}</span>
        <button type="button" disabled={requestState !== 'success' || !result || !campaignListHasNext(result)} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
    </section>
  )
}
