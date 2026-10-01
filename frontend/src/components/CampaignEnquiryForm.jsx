import { useEffect, useRef, useState } from 'react'
import { engagementErrorMessage, sendCampaignEnquiry, uncertainWrite, validateEnquiry } from '../services/engagementService.js'
import '../styles/engagement.css'

const empty = { name: '', email: '', phone: '', message: '' }

export default function CampaignEnquiryForm({ campaign, token, role }) {
  const [values, setValues] = useState(empty)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const form = useRef(null)
  const success = useRef(null)
  const focusError = useRef(false)
  const inFlight = useRef(false)
  const version = useRef(0)
  const controllerRef = useRef(null)
  const eligible = campaign?.status === 'approved' && campaign?.type === 'business'
  const allowed = ['public', 'business_owner'].includes(role)
  const loginHref = `/login?returnTo=${encodeURIComponent(`/campaigns/${campaign?.id}`)}`

  useEffect(() => {
    setValues(empty); setErrors({}); setError(null); setSaving(false); setSent(false); setUncertain(false); setAcknowledged(false); inFlight.current = false
    return () => { version.current += 1; controllerRef.current?.abort() }
  }, [campaign?.id, token, role])
  useEffect(() => { if (sent) success.current?.focus() }, [sent])
  useEffect(() => {
    if (focusError.current && !saving) { form.current?.querySelector('[aria-invalid="true"]')?.focus(); focusError.current = false }
  }, [errors, saving])

  async function submit(event) {
    event.preventDefault()
    if (!token || !allowed || !eligible || inFlight.current || (uncertain && !acknowledged)) return
    const nextErrors = validateEnquiry(values)
    setErrors(nextErrors); focusError.current = Boolean(Object.keys(nextErrors).length)
    if (focusError.current) return
    inFlight.current = true; setSaving(true); setError(null)
    const requestVersion = ++version.current
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      await sendCampaignEnquiry(campaign.id, values, { token, signal: controller.signal })
      if (requestVersion !== version.current) return
      setSent(true); setUncertain(false)
    } catch (failure) {
      if (requestVersion !== version.current || failure.code === 'ABORTED') return
      const fields = Object.fromEntries(Object.entries(failure.fieldErrors || {}).filter(([field]) => Object.hasOwn(empty, field)))
      setErrors(fields); focusError.current = Boolean(Object.keys(fields).length)
      setError(failure); setUncertain(uncertainWrite(failure)); setAcknowledged(false)
    } finally {
      if (requestVersion === version.current) { inFlight.current = false; setSaving(false); controllerRef.current = null }
    }
  }

  function field(name) {
    return { name, value: values[name], 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `enquiry-${name}-error` : undefined,
      onChange: (event) => { setValues((current) => ({ ...current, [name]: event.target.value })); setErrors((current) => ({ ...current, [name]: '' })); if (!uncertain) setError(null) } }
  }
  const fieldError = (name) => errors[name] ? <p className="engagement-field-error" id={`enquiry-${name}-error`}>{errors[name]}</p> : null

  if (!eligible) return null
  return <section className="engagement-panel" aria-labelledby="enquiry-title">
    <h2 id="enquiry-title">Enquire about this campaign</h2>
    <p>Send the business a message to express your interest. This does not make a booking or purchase.</p>
    {!token ? <a className="text-link" href={loginHref}>Log in to send an enquiry</a>
      : !allowed ? <p>Public users and business owners can send an enquiry.</p>
        : sent ? <div ref={success} tabIndex="-1" className="engagement-success" role="status"><h3>Enquiry sent</h3><p>The business can contact you using the details you provided.</p></div>
          : <form ref={form} noValidate aria-label="Campaign enquiry form" onSubmit={submit}>
            <p id="enquiry-privacy" className="engagement-help">The business owner will receive your name, email, optional phone number and message.</p>
            <fieldset disabled={saving} className="engagement-form"><legend className="visually-hidden">Your contact details and message</legend>
              <div><label htmlFor="enquiry-name">Name</label><input id="enquiry-name" autoComplete="name" maxLength="100" {...field('name')} />{fieldError('name')}</div>
              <div><label htmlFor="enquiry-email">Email</label><input id="enquiry-email" type="email" autoComplete="email" maxLength="150" {...field('email')} />{fieldError('email')}</div>
              <div><label htmlFor="enquiry-phone">Phone <span>(optional)</span></label><input id="enquiry-phone" type="tel" autoComplete="tel" maxLength="20" {...field('phone')} />{fieldError('phone')}</div>
              <div className="engagement-form-full"><label htmlFor="enquiry-message">Message</label><textarea id="enquiry-message" rows="5" maxLength="2000" {...field('message')} />{fieldError('message')}</div>
              {uncertain ? <div className="engagement-form-full engagement-notice" role="alert"><p>Your enquiry may already have been sent. Sending it again could create a duplicate.</p><label className="engagement-checkbox"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I understand and want to try sending again.</label></div> : null}
              <div className="engagement-form-full"><button type="submit" aria-describedby="enquiry-privacy" disabled={saving || (uncertain && !acknowledged) || [401, 403, 404].includes(error?.status)}>{saving ? 'Sending enquiry…' : 'Send enquiry'}</button></div>
            </fieldset>
            {error && !uncertain ? <div role="alert" className="engagement-notice"><p>{engagementErrorMessage(error)}</p>{error.status === 401 ? <a className="text-link" href={loginHref}>Log in again</a> : null}</div> : null}
          </form>}
  </section>
}
