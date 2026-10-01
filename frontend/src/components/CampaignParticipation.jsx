import { useEffect, useRef, useState } from 'react'
import { engagementErrorMessage, loadParticipation, setParticipation, uncertainWrite } from '../services/engagementService.js'
import '../styles/engagement.css'

export default function CampaignParticipation({ campaign, token, role }) {
  const [participation, setRecord] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const inFlight = useRef(false)
  const version = useRef(0)
  const writeController = useRef(null)
  const eligible = campaign?.status === 'approved' && campaign?.type === 'cause'
  const allowed = ['public', 'business_owner'].includes(role)
  const loginHref = `/login?returnTo=${encodeURIComponent(`/campaigns/${campaign?.id}`)}`

  useEffect(() => {
    setRecord(null); setError(null); setSaving(false); inFlight.current = false
    if (!token || !allowed || !eligible) return undefined
    setState('loading')
    const controller = new AbortController()
    loadParticipation(campaign.id, { token, signal: controller.signal }).then((record) => {
      if (controller.signal.aborted) return
      setRecord(record); setState('ready'); setUncertain(false)
    }).catch((failure) => {
      if (controller.signal.aborted) return
      setError(failure); setState('error')
    })
    return () => { controller.abort(); writeController.current?.abort(); version.current += 1 }
  }, [campaign?.id, token, role, eligible, retry])

  async function changeStatus() {
    if (inFlight.current || state !== 'ready' || uncertain || !token || !allowed || !eligible) return
    inFlight.current = true; setSaving(true); setError(null)
    const requestVersion = ++version.current
    const controller = new AbortController()
    writeController.current = controller
    try {
      const record = await setParticipation(campaign.id, participation?.status === 'joined' ? 'withdrawn' : 'joined', { token, signal: controller.signal })
      if (requestVersion !== version.current) return
      setRecord(record)
    } catch (failure) {
      if (requestVersion !== version.current || failure.code === 'ABORTED') return
      setError(failure); setUncertain(uncertainWrite(failure))
    } finally {
      if (requestVersion === version.current) { inFlight.current = false; setSaving(false); writeController.current = null }
    }
  }

  if (!eligible) return null
  return <section className="engagement-panel" aria-labelledby="participation-title">
    <h2 id="participation-title">Support this campaign</h2>
    <p>Join to show your support. You can withdraw here or from My participation, including when the campaign is no longer public.</p>
    {!token ? <a className="text-link" href={loginHref}>Log in to join</a>
      : !allowed ? <p>Public users and business owners can join social-cause campaigns.</p>
        : <>
          {state === 'loading' ? <p role="status">Checking your participation…</p> : null}
          {state === 'ready' && !uncertain ? <p role="status">{participation?.status === 'joined' ? 'You have joined this campaign.' : participation?.status === 'withdrawn' ? 'You have withdrawn from this campaign.' : 'You have not joined this campaign yet.'}</p> : null}
          {error ? <div className="engagement-notice" role="alert"><p>{uncertain ? 'We could not confirm the change. Check your participation status before trying again.' : engagementErrorMessage(error)}</p>
            {error.status === 401 ? <a className="text-link" href={loginHref}>Log in again</a>
              : error.status !== 403 ? <button type="button" disabled={saving || state === 'loading'} onClick={() => setRetry((value) => value + 1)}>{uncertain ? 'Check participation status' : 'Refresh participation status'}</button> : null}
          </div> : null}
          {state === 'ready' ? <button type="button" disabled={saving || uncertain || [401, 403, 404].includes(error?.status)} onClick={changeStatus}>{saving ? 'Updating participation…' : participation?.status === 'joined' ? 'Withdraw participation' : 'Join campaign'}</button> : null}
          <p><a className="text-link" href="/my-participation">My participation</a></p>
        </>}
  </section>
}
