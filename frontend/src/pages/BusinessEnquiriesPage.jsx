import { useEffect, useState } from 'react'
import { engagementErrorMessage, formatEngagementDate, loadBusinessEnquiries } from '../services/engagementService.js'
import '../styles/engagement.css'

export default function BusinessEnquiriesPage({ token, role }) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const allowed = role === 'business_owner'
  useEffect(() => { setPage(1) }, [token, role])
  useEffect(() => {
    setResult(null); setError(null)
    if (!token || !allowed) return undefined
    setLoading(true)
    const controller = new AbortController()
    loadBusinessEnquiries({ token, signal: controller.signal, page, pageSize: 10 }).then((body) => {
      if (!controller.signal.aborted) { setResult(body); setLoading(false) }
    }).catch((failure) => { if (!controller.signal.aborted) { setError(failure); setLoading(false) } })
    return () => controller.abort()
  }, [token, role, page, retry])

  return <section className="engagement-page content-width" aria-labelledby="business-enquiries-title">
    <header><h1 id="business-enquiries-title">Business enquiries</h1><p>Messages sent to your business about its campaigns. Contact details are private to your business account.</p></header>
    {!token ? <a className="text-link" href="/login?returnTo=%2Fbusiness%2Fenquiries">Log in to see business enquiries</a>
      : !allowed ? <p>A business-owner account is needed to view enquiries.</p>
        : <>
          <button type="button" disabled={loading} onClick={() => setRetry((value) => value + 1)}>Refresh enquiries</button>
          {loading ? <p role="status">Loading your enquiries…</p> : null}
          {error ? <div role="alert" className="engagement-notice"><p>{engagementErrorMessage(error)}</p>{error.status === 401 ? <a className="text-link" href="/login?returnTo=%2Fbusiness%2Fenquiries">Log in again</a> : error.code === 'BUSINESS_PROFILE_REQUIRED' ? <a className="text-link" href="/business/profile">Set up business profile</a> : null}</div> : null}
          {result ? <><p role="status">{result.enquiries.length ? `${result.enquiries.length} enquir${result.enquiries.length === 1 ? 'y' : 'ies'} on page ${result.page}` : 'No enquiries on this page.'}</p>
            {result.enquiries.length ? <ul className="engagement-list">{result.enquiries.map((item) => <li key={item.id} className="engagement-card">
              <p className="engagement-help">Received {formatEngagementDate(item.createdAt)}</p><h2>{item.campaign?.title || 'Campaign unavailable'}</h2>
              <dl className="engagement-contact"><div><dt>Name</dt><dd>{item.name}</dd></div><div><dt>Email</dt><dd><a href={`mailto:${encodeURIComponent(item.email)}`}>{item.email}</a></dd></div>{item.phone ? <div><dt>Phone</dt><dd>{item.phone}</dd></div> : null}</dl>
              <h3>Message</h3><p className="engagement-message">{item.message}</p>
              {item.campaign?.status === 'approved' ? <a className="text-link" href={`/campaigns/${item.campaignId}`}>View campaign<span className="visually-hidden">: {item.campaign.title}</span></a> : <p>This campaign is no longer publicly available.</p>}
            </li>)}</ul> : <p>Enquiries will appear here when someone sends a message about your business campaign.</p>}
          </> : null}
          <nav className="engagement-pagination" aria-label="Enquiry pages"><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={loading || !result || page * result.pageSize >= result.total} onClick={() => setPage((value) => value + 1)}>Next</button></nav>
        </>}
  </section>
}
