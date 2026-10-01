import { useEffect, useState } from 'react'
import { loadCampaignReviews } from '../services/campaignManagementService.js'
import '../styles/admin-management.css'

function reviewedAt(value) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function CampaignReviewHistory({ campaignId, token, role, refreshKey = 0, historyLoader = loadCampaignReviews }) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => { setPage(1) }, [campaignId, refreshKey])
  useEffect(() => {
    if (!token || role !== 'admin') return undefined
    const controller = new AbortController()
    setResult(null); setState('loading'); setError(null)
    historyLoader(campaignId, { token, signal: controller.signal, page, pageSize: 10 }).then((data) => {
      if (controller.signal.aborted) return
      setResult(data); setState('success')
    }).catch((failure) => {
      if (controller.signal.aborted) return
      setError(failure); setState('error')
    })
    return () => controller.abort()
  }, [campaignId, token, role, page, retry, refreshKey, historyLoader])

  if (!token || role !== 'admin') return null
  return (
    <section className="campaign-review-history" aria-labelledby="campaign-review-history-title">
      <h3 id="campaign-review-history-title">Review history</h3>
      <p className="campaign-management__meta">Approval and rejection decisions, newest first. Times use your browser’s time zone.</p>
      {state === 'loading' ? <p role="status">Loading review history…</p> : null}
      {state === 'error' ? <div role="alert"><p>{error?.status === 401 ? 'Log in again to view review history.' : error?.status === 403 ? 'Your account cannot view review history.' : 'Review history could not be loaded.'}</p>
        {error?.status === 401 ? <a className="text-link" href={`/login?returnTo=${encodeURIComponent(`/admin/campaigns/${campaignId}`)}`}>Log in again</a> : error?.status !== 403 ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry review history</button> : null}</div> : null}
      {state === 'success' && result ? <>
        {!result.reviews.length ? <p>No review decisions on this page.</p> : <ol>{result.reviews.map((review) => <li key={review.id}>
          <div className="campaign-management__card-top"><strong>{review.action === 'approved' ? 'Approved' : 'Rejected'}</strong><time dateTime={review.reviewedAt}>{reviewedAt(review.reviewedAt)}</time></div>
          <p className="campaign-management__meta">Administrator #{review.adminId} · Review #{review.id}</p>
          <p className="campaign-review-history__comments">{review.comments || 'No comments provided.'}</p>
        </li>)}</ol>}
        <nav className="campaign-management__pagination" aria-label="Review history pages"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous reviews</button><span>Page {page}</span>
          <button type="button" disabled={result.page * result.pageSize >= result.total} onClick={() => setPage((value) => value + 1)}>Next reviews</button></nav>
      </> : null}
    </section>
  )
}
