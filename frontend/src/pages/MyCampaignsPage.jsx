import { useCallback, useState } from 'react'
import useLiveRefresh from '../hooks/useLiveRefresh.js'
import {
  CAMPAIGN_STATUSES, campaignListHasNext, formatCampaignDate,
  loadMyCampaigns, managementErrorMessage,
} from '../services/campaignManagementService.js'
import '../styles/campaign-management.css'
const privateUnavailable = error => [401, 403, 404].includes(error?.status)

export default function MyCampaignsPage({ token, role, campaignLoader = loadMyCampaigns }) {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const allowedRole = role === 'public' || role === 'business_owner'
  const loader = useCallback(({ signal }) => campaignLoader({ token, signal, page, pageSize: 10, status }), [token, page, status, campaignLoader])
  const live = useLiveRefresh(loader, { resourceKey: `${token}:${page}:${status}`, enabled: Boolean(token && allowedRole), isUnavailable: privateUnavailable })
  const result = live.data
  const error = live.error
  const requestState = live.isLoading ? 'loading' : result ? 'success' : 'error'

  if (!token || !allowedRole) {
    return (
      <section className="campaign-management content-width">
        <h1>{!token ? 'Log in to see your campaigns' : 'Campaign author access required'}</h1>
        <p>Your submissions and their review status appear here.</p>
        <a className="text-link" href={!token ? '/login?returnTo=%2Fmy-campaigns' : '/'}>{!token ? 'Log in' : 'Back to home'}</a>
      </section>
    )
  }

  return (
    <section className="campaign-management content-width" aria-labelledby="my-campaigns-title">
      <header className="campaign-management__heading campaign-management__heading--split">
        <div>
          <p className="campaign-management__eyebrow">Your contributions</p>
          <h1 id="my-campaigns-title">My campaigns</h1>
          <p>Track your submissions and read the outcome of each review.</p>
        </div>
        <a className="campaign-management__primary-link" href={role === 'business_owner' ? '/business/campaigns/new' : '/campaigns/new'}>Post a campaign</a>
      </header>
      <div className="campaign-management__filters">
        <div>
          <label htmlFor="my-campaign-status">Campaign status</label>
          <select id="my-campaign-status" value={status} onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}>
            <option value="">All statuses</option>
            {CAMPAIGN_STATUSES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
        </div>
        <button type="button" disabled={live.refreshing} onClick={live.refresh}>Refresh status</button>
      </div>
      {requestState === 'loading' ? <p role="status">Loading your campaigns…</p> : null}
      {live.updatedAt ? <p className="campaign-management__meta">Last updated <time dateTime={live.updatedAt.toISOString()}>{live.updatedAt.toLocaleTimeString('en-AU')}</time>. Status updates automatically while this page is open.</p> : null}
      {live.paused === 'offline' ? <p role="status">You’re offline. Updates will resume when you reconnect.</p> : null}
      {error ? (
        <div className="campaign-management__notice" role="alert">
          <p>{result ? 'Updates could not be loaded. Showing your last loaded campaigns.' : managementErrorMessage(error)}</p>
          {error?.status === 401 ? <a className="text-link" href="/login?returnTo=%2Fmy-campaigns">Log in again</a>
            : error?.status !== 403 ? <button type="button" onClick={live.refresh}>Try again</button> : null}
        </div>
      ) : null}
      {requestState === 'success' && result ? (
        <>
          <p className="campaign-management__count" role="status">{result.campaigns.length ? `${result.campaigns.length} campaign${result.campaigns.length === 1 ? '' : 's'} on page ${result.page}` : 'No campaigns found.'}</p>
          {!result.campaigns.length ? <p>{status ? 'You have no campaigns with this status on this page.' : 'Your submitted campaigns will appear here.'}</p> : (
            <ul className="campaign-management__list">
              {result.campaigns.map((campaign) => (
                <li className="campaign-management__card" key={campaign.id}>
                  <div className="campaign-management__card-top">
                    <span className={`campaign-status campaign-status--${campaign.status}`}>{campaign.status}</span>
                    <span className="campaign-management__meta">Submitted {formatCampaignDate(campaign.createdAt)}</span>
                  </div>
                  <h2>{campaign.title}</h2>
                  <p className="campaign-management__meta">{campaign.category || 'Uncategorised'}{campaign.business?.businessName ? ` · ${campaign.business.businessName}` : ''}</p>
                  <p>{campaign.status === 'pending' ? 'Waiting for review. This campaign is not visible publicly.'
                    : campaign.status === 'rejected' ? 'This campaign was not approved and is not visible publicly.' : 'Your campaign is approved and visible publicly.'}</p>
                  {campaign.status === 'rejected' ? (
                    <div className="campaign-management__feedback">
                      <h3>Review feedback</h3>
                      <p>{campaign.review?.comments || 'No review feedback was provided.'}</p>
                    </div>
                  ) : campaign.review?.comments ? <p><strong>Review note:</strong> {campaign.review.comments}</p> : null}
                  <details>
                    <summary>View submitted details<span className="visually-hidden"> for {campaign.title}</span></summary>
                    {campaign.imageUrl ? <img key={campaign.imageUrl} className="campaign-management__image" src={campaign.imageUrl} alt="Your submitted campaign image" onError={(event) => { event.currentTarget.hidden = true }} /> : null}
                    <p className="campaign-management__description">{campaign.description}</p>
                    <dl className="campaign-management__facts">
                      <div><dt>Campaign reference</dt><dd>#{campaign.id}</dd></div>
                      {campaign.type ? <div><dt>Campaign type</dt><dd>{campaign.type === 'business' ? 'Small business' : 'Social cause'}</dd></div> : null}
                      {campaign.startDate ? <div><dt>Starts</dt><dd>{formatCampaignDate(campaign.startDate)}</dd></div> : null}
                      {campaign.endDate ? <div><dt>Ends</dt><dd>{formatCampaignDate(campaign.endDate)}</dd></div> : null}
                      {campaign.targetAudience ? <div><dt>Target audience</dt><dd>{campaign.targetAudience}</dd></div> : null}
                      {campaign.review?.reviewedAt ? <div><dt>Reviewed</dt><dd>{formatCampaignDate(campaign.review.reviewedAt)}</dd></div> : null}
                    </dl>
                  </details>
                  <p><a className="text-link" href={`/my-campaigns/${campaign.id}/edit`}>{campaign.status === 'rejected' ? 'Edit and resubmit' : 'Manage campaign'}<span className="visually-hidden">: {campaign.title}</span></a></p>
                  {campaign.status === 'approved' ? <a className="text-link" href={`/campaigns/${campaign.id}`}>View public campaign<span className="visually-hidden">: {campaign.title}</span></a> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      <nav className="campaign-management__pagination" aria-label="My campaign pages">
        <button type="button" disabled={page <= 1 || requestState === 'loading'} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>Page {page}</span>
        <button type="button" disabled={requestState !== 'success' || !result || !campaignListHasNext(result)} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>
    </section>
  )
}
