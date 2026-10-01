import { useCallback, useEffect, useRef, useState } from 'react'
import { engagementErrorMessage, formatEngagementDate, loadMyParticipation, loadParticipation, setParticipation, uncertainWrite } from '../services/engagementService.js'
import '../styles/engagement.css'

function ParticipationRecord({ item, token, onBusyChange }) {
  const [record, setRecord] = useState(item)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const request = useRef(null)
  const inFlight = useRef(false)
  useEffect(() => () => {
    request.current?.abort()
    if (inFlight.current) { inFlight.current = false; onBusyChange(-1) }
  }, [onBusyChange])

  async function update(checkOnly = false) {
    if (inFlight.current || (!checkOnly && (record?.status !== 'joined' || uncertain || [401, 403, 404].includes(error?.status)))) return
    const controller = new AbortController()
    request.current = controller; inFlight.current = true; onBusyChange(1); setBusy(true); setError(null)
    try {
      const saved = checkOnly
        ? await loadParticipation(item.campaignId, { token, signal: controller.signal })
        : await setParticipation(item.campaignId, 'withdrawn', { token, signal: controller.signal })
      if (!controller.signal.aborted) { setRecord(saved); setUncertain(false) }
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(failure)
      if (!checkOnly) setUncertain(uncertainWrite(failure))
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; onBusyChange(-1); setBusy(false) }
    }
  }

  return <li className="engagement-card">
    <span role="status" className={`engagement-status engagement-status--${record?.status || 'withdrawn'}`}>{uncertain ? 'Status unconfirmed' : record?.status === 'joined' ? 'Joined' : record?.status === 'withdrawn' ? 'Withdrawn' : 'Participation record unavailable'}</span>
    <h2>{item.campaign?.title || 'Campaign unavailable'}</h2><p>First joined {formatEngagementDate(item.participatedAt)}</p>
    {item.campaign?.status === 'approved' ? <a className="text-link" href={`/campaigns/${item.campaignId}`}>View campaign<span className="visually-hidden">: {item.campaign.title}</span></a> : <p>This campaign is no longer publicly available.</p>}
    {record?.status === 'joined' ? <p><button type="button" disabled={busy || uncertain || [401, 403, 404].includes(error?.status)} onClick={() => update()}>{busy ? 'Updating participation…' : 'Withdraw participation'}<span className="visually-hidden">: {item.campaign?.title || `campaign #${item.campaignId}`}</span></button></p> : null}
    {error || uncertain ? <div className="engagement-notice" role="alert">
      <p>{uncertain ? 'The withdrawal could not be confirmed. Check the saved participation status before trying again.' : engagementErrorMessage(error)}</p>
      {uncertain && error ? <p>{engagementErrorMessage(error)}</p> : null}
      {error?.status === 401 ? <a className="text-link" href="/login?returnTo=%2Fmy-participation">Log in again</a>
        : error?.status !== 403 ? <button type="button" disabled={busy} onClick={() => update(true)}>{busy ? 'Checking participation…' : 'Check participation status'}</button> : null}
    </div> : null}
  </li>
}

export default function MyParticipationPage({ token, role }) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeActions, setActiveActions] = useState(0)
  const changeBusy = useCallback(delta => setActiveActions(count => Math.max(0, count + delta)), [])
  const allowed = ['public', 'business_owner'].includes(role)
  const resourceKey = JSON.stringify([token, role, page])
  const currentResult = result?.key === resourceKey ? result.data : null
  useEffect(() => { setPage(1) }, [token, role])
  useEffect(() => {
    setResult(null); setError(null)
    if (!token || !allowed) return undefined
    setLoading(true)
    const controller = new AbortController()
    loadMyParticipation({ token, signal: controller.signal, page, pageSize: 10 }).then((body) => {
      if (!controller.signal.aborted) { setResult({ key: resourceKey, data: body }); setLoading(false) }
    }).catch((failure) => { if (!controller.signal.aborted) { setError(failure); setLoading(false) } })
    return () => controller.abort()
  }, [token, role, page, retry])

  return <section className="engagement-page content-width" aria-labelledby="my-participation-title">
    <header><h1 id="my-participation-title">My participation</h1><p>See the social-cause campaigns you have joined or withdrawn from. Participation can be withdrawn here even when a campaign is no longer public.</p></header>
    {!token ? <a className="text-link" href="/login?returnTo=%2Fmy-participation">Log in to see your participation</a>
      : !allowed ? <p>Participation is available to public users and business owners.</p>
        : <>
          <button type="button" disabled={loading || activeActions > 0} onClick={() => setRetry((value) => value + 1)}>Refresh participation</button>
          {loading ? <p role="status">Loading your participation…</p> : null}
          {error ? <div role="alert" className="engagement-notice"><p>{engagementErrorMessage(error)}</p>{error.status === 401 ? <a className="text-link" href="/login?returnTo=%2Fmy-participation">Log in again</a> : null}</div> : null}
          {currentResult ? <><p role="status">{currentResult.participations.length ? `${currentResult.participations.length} record${currentResult.participations.length === 1 ? '' : 's'} on page ${currentResult.page}` : 'No participation records on this page.'}</p>
            {!currentResult.participations.length ? <p><a className="text-link" href="/#campaigns">Explore social-cause campaigns</a></p> : <ul className="engagement-list">{currentResult.participations.map((item) => <ParticipationRecord key={`${token}:${role}:${item.id}`} item={item} token={token} onBusyChange={changeBusy} />)}</ul>}
          </> : null}
          <nav className="engagement-pagination" aria-label="Participation pages"><button type="button" disabled={loading || activeActions > 0 || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={loading || activeActions > 0 || !currentResult || page * currentResult.pageSize >= currentResult.total} onClick={() => setPage((value) => value + 1)}>Next</button></nav>
        </>}
  </section>
}
