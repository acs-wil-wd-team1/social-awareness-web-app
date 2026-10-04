import { useEffect, useRef, useState } from 'react'
import { loadBusinessProfile, saveBusinessProfile, validateBusinessProfile } from '../services/businessService.js'
import { authPagePath } from '../services/authSession.js'
import '../styles/campaign-posting.css'

const emptyProfile = { businessName: '', abn: '', website: '', description: '' }
const loginPath = authPagePath('/login', '/business/profile')

export default function BusinessProfilePage({ token = localStorage.getItem('token'), role = 'business_owner' }) {
  const [values, setValues] = useState(emptyProfile)
  const [state, setState] = useState('loading')
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const form = useRef(null)
  const success = useRef(null)
  const inFlight = useRef(false)
  const focusError = useRef(false)
  const requestVersion = useRef(0)
  const saveController = useRef(null)
  const allowed = role === 'business_owner'

  useEffect(() => {
    inFlight.current = false
    setIsSaving(false)
    setSaved(false)
    setErrors({})
    setValues(emptyProfile)
    if (!token || !allowed) return undefined
    let current = true
    const controller = new AbortController()
    setState('loading')
    setError(null)
    loadBusinessProfile({ token, signal: controller.signal }).then((business) => {
      if (!current) return
      setValues(Object.fromEntries(Object.keys(emptyProfile).map((field) => [field, business?.[field] || ''])))
      setState('ready')
    }).catch((failure) => {
      if (!current || failure.code === 'ABORTED') return
      setError(failure)
      setState('error')
    })
    return () => {
      current = false
      requestVersion.current += 1
      controller.abort()
      saveController.current?.abort()
    }
  }, [token, allowed, retry])

  useEffect(() => {
    if (focusError.current && !isSaving) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
      focusError.current = false
    }
  }, [errors, isSaving])

  useEffect(() => { if (saved) success.current?.focus() }, [saved])

  function fieldProps(name) {
    return {
      name, value: values[name], 'aria-invalid': Boolean(errors[name]),
      'aria-describedby': errors[name] ? `business-${name}-error` : undefined,
      onChange: (event) => {
        setValues((current) => ({ ...current, [name]: event.target.value }))
        setErrors((current) => ({ ...current, [name]: '' }))
        setError(null)
        setSaved(false)
      },
    }
  }
  function fieldError(name) {
    return errors[name] ? <p className="campaign-form-error" id={`business-${name}-error`}>{errors[name]}</p> : null
  }

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || !token || !allowed || state !== 'ready') return
    const nextErrors = validateBusinessProfile(values)
    setErrors(nextErrors)
    setError(null)
    setSaved(false)
    focusError.current = Boolean(Object.keys(nextErrors).length)
    if (focusError.current) return
    inFlight.current = true
    setIsSaving(true)
    const version = ++requestVersion.current
    const controller = new AbortController()
    saveController.current = controller
    try {
      const business = await saveBusinessProfile(values, { token, signal: controller.signal })
      if (version !== requestVersion.current) return
      setValues(Object.fromEntries(Object.keys(emptyProfile).map((field) => [field, business[field] || ''])))
      setSaved(true)
    } catch (failure) {
      if (version !== requestVersion.current || failure.code === 'ABORTED') return
      const fields = Object.fromEntries(Object.entries(failure.fieldErrors || {}).filter(([field]) => Object.hasOwn(emptyProfile, field)))
      setErrors(fields)
      focusError.current = Boolean(Object.keys(fields).length)
      setError(failure)
    } finally {
      if (version === requestVersion.current) {
        inFlight.current = false
        setIsSaving(false)
        saveController.current = null
      }
    }
  }

  return (
    <section className="campaign-form-page content-width" aria-labelledby="business-profile-title">
      <div className="campaign-form-card">
        <div className="campaign-form-intro"><p className="campaign-form-eyebrow">Small business</p><h1 id="business-profile-title">Business profile</h1>
          <p>Add the business details that will appear with your campaigns.</p></div>
        {!token ? <><p>Log in to manage your business profile.</p><a className="text-link" href={loginPath}>Log in</a></>
          : !allowed ? <><p>A business-owner account is needed to manage a business profile.</p><a className="text-link" href="/">Back to home</a></>
            : state === 'loading' ? <p role="status">Loading your business profile…</p>
              : state === 'error' ? <div role="alert"><p>{error.message}</p>{error.status === 401 ? <a className="text-link" href={loginPath}>Log in again</a> : <button className="campaign-secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>Retry business profile</button>}</div>
                : <>
                  {saved ? <div ref={success} className="campaign-form-success" role="status" tabIndex="-1"><h2>Business profile saved</h2><p>Your business details are ready to use.</p><a className="text-link" href="/business/campaigns/new">Create a business campaign</a></div> : null}
                  <form ref={form} aria-label="Business profile form" noValidate onSubmit={submit}>
                    <fieldset className="campaign-form" disabled={isSaving}>
                      <legend className="visually-hidden">Business details</legend>
                      <div className="campaign-form-field campaign-form-field--full"><label htmlFor="business-name">Business name</label><input id="business-name" maxLength="150" autoComplete="organization" {...fieldProps('businessName')} />{fieldError('businessName')}</div>
                      <div className="campaign-form-field"><label htmlFor="business-abn">ABN <span>(optional)</span></label><input id="business-abn" maxLength="20" {...fieldProps('abn')} />{fieldError('abn')}</div>
                      <div className="campaign-form-field"><label htmlFor="business-website">Website <span>(optional)</span></label><input id="business-website" type="url" placeholder="https://example.com" maxLength="255" {...fieldProps('website')} />{fieldError('website')}</div>
                      <div className="campaign-form-field campaign-form-field--full"><label htmlFor="business-description">About your business <span>(optional)</span></label><textarea id="business-description" rows="5" maxLength="2000" {...fieldProps('description')} />{fieldError('description')}</div>
                      <div className="campaign-form-actions campaign-form-field--full business-profile-actions"><button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save business profile'}</button><a className="text-link" href="/my-campaigns">My campaigns</a></div>
                    </fieldset>
                    {error ? <div role="alert" className="campaign-submission-error"><p>{error.message}</p>
                      {error.status === 401 ? <a className="text-link" href={loginPath}>Log in again</a> : null}
                      {['NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code) ? <button type="button" className="campaign-secondary-button" onClick={() => setRetry((value) => value + 1)}>Reload business profile</button> : null}
                    </div> : null}
                  </form>
                </>}
      </div>
    </section>
  )
}
