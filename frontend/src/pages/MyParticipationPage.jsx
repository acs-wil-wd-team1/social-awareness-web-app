import { useEffect, useState } from 'react'
import { engagementErrorMessage, formatEngagementDate, loadMyParticipation } from '../services/engagementService.js'
import '../styles/engagement.css'

export default function MyParticipationPage({ token, role }) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const allowed = ['public', 'business_owner'].includes(role)
  useEffect(() => { setPage(1) }, [token, role])
  useEffect(() => {
    setResult(null); setError(null)
    if (!token || !allowed) return undefined
    setLoading(true)
    const controller = new AbortController()
    loadMyParticipation({ token, signal: controller.signal, page, pageSize: 10 }).then((body) => {
      if (!controller.signal.aborted) { setResult(body); setLoading(false) }
    }).catch((failure) => { if (!controller.signal.aborted) { setError(failure); setLoading(false) } })
    return () => controller.abort()
  }, [token, role, page, retry])

  return <section className="engagement-page content-width" aria-labelledby="my-participation-title">
    <header><h1 id="my-participation-title">My participation</h1><p>See the social-cause campaigns you have joined or withdrawn from.</p></header>
    {!token ? <a className="text-link" href="/login?returnTo=%2Fmy-participation">Log in to see your participation</a>
      : !allowed ? <p>Participation is available to public users and business owners.</p>
        : <>
          <button type="button" disabled={loading} onClick={() => setRetry((value) => value + 1)}>Refresh participation</button>
          {loading ? <p role="status">Loading your participation…</p> : null}
          {error ? <div role="alert" className="engagement-notice"><p>{engagementErrorMessage(error)}</p>{error.status === 401 ? <a className="text-link" href="/login?returnTo=%2Fmy-participation">Log in again</a> : null}</div> : null}
          {result ? <><p role="status">{result.participations.length ? `${result.participations.length} record${result.participations.length === 1 ? '' : 's'} on page ${result.page}` : 'No participation records on this page.'}</p>
            {!result.participations.length ? <p><a className="text-link" href="/#campaigns">Explore social-cause campaigns</a></p> : <ul className="engagement-list">{result.participations.map((item) => <li key={item.id} className="engagement-card">
              <span className={`engagement-status engagement-status--${item.status}`}>{item.status === 'joined' ? 'Joined' : 'Withdrawn'}</span>
              <h2>{item.campaign?.title || 'Campaign unavailable'}</h2><p>First joined {formatEngagementDate(item.participatedAt)}</p>
              {item.campaign?.status === 'approved' ? <a className="text-link" href={`/campaigns/${item.campaignId}`}>View campaign<span className="visually-hidden">: {item.campaign.title}</span></a> : <p>This campaign is no longer publicly available.</p>}
            </li>)}</ul>}
          </> : null}
          <nav className="engagement-pagination" aria-label="Participation pages"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={loading || !result || page * result.pageSize >= result.total} onClick={() => setPage((value) => value + 1)}>Next</button></nav>
        </>}
  </section>
}
