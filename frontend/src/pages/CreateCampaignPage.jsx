import { useEffect, useRef, useState } from 'react'
import { loadCampaignCategories, submitCampaign, uploadCampaignImage } from '../services/campaignSubmissionService.js'
import { validateCampaignSubmission } from '../services/campaignSubmissionValidation.js'
import { loadBusinessProfile } from '../services/businessService.js'
import { authPagePath } from '../services/authSession.js'
import CampaignImageInput from '../components/CampaignImageInput.jsx'
import '../styles/campaign-posting.css'

const initialValues = {
  title: '', description: '', categoryId: '', targetAudience: '', startDate: '', endDate: '',
}

export default function CreateCampaignPage({ token = localStorage.getItem('token'), role = 'public', mode = 'cause' }) {
  const isBusiness = mode === 'business'
  const loginPath = authPagePath('/login', isBusiness ? '/business/campaigns/new' : '/campaigns/new')
  const allowed = role === (isBusiness ? 'business_owner' : 'public')
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [categories, setCategories] = useState([])
  const [categoryState, setCategoryState] = useState('loading')
  const [categoryError, setCategoryError] = useState('')
  const [categoryRetry, setCategoryRetry] = useState(0)
  const [submissionError, setSubmissionError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savedCampaign, setSavedCampaign] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imageError, setImageError] = useState('')
  const [submitStage, setSubmitStage] = useState('')
  const [uncertainSubmission, setUncertainSubmission] = useState(false)
  const [retryAcknowledged, setRetryAcknowledged] = useState(false)
  const uploadedImage = useRef(null)
  const [business, setBusiness] = useState(null)
  const [businessState, setBusinessState] = useState('loading')
  const [businessError, setBusinessError] = useState(null)
  const [businessRetry, setBusinessRetry] = useState(0)
  const form = useRef(null)
  const success = useRef(null)
  const shouldFocusError = useRef(false)
  const inFlight = useRef(false)
  const requestVersion = useRef(0)
  const submissionController = useRef(null)

  useEffect(() => {
    inFlight.current = false
    setIsSubmitting(false)
    setSavedCampaign(null)
    setSubmissionError(null)
    setUncertainSubmission(false)
    setRetryAcknowledged(false)
    setValues(initialValues)
    setErrors({})
    setImageFile(null)
    setImageError('')
    uploadedImage.current = null
    return () => {
      requestVersion.current += 1
      submissionController.current?.abort()
    }
  }, [token, role, mode])

  useEffect(() => {
    if (!token || !allowed) return undefined
    const controller = new AbortController()
    let current = true
    setCategoryState('loading')
    setCategoryError('')
    loadCampaignCategories({ signal: controller.signal })
      .then((loaded) => {
        if (!current) return
        setCategories(loaded)
        setCategoryState(loaded.length ? 'ready' : 'empty')
      })
      .catch((error) => {
        if (!current || error.code === 'ABORTED') return
        setCategoryState('error')
        setCategoryError(error.message)
      })
    return () => { current = false; controller.abort() }
  }, [token, allowed, categoryRetry])

  useEffect(() => {
    if (!token || !allowed || !isBusiness) return undefined
    const controller = new AbortController()
    let current = true
    setBusinessState('loading')
    setBusinessError(null)
    loadBusinessProfile({ token, signal: controller.signal }).then((profile) => {
      if (!current) return
      setBusiness(profile)
      setBusinessState(profile ? 'ready' : 'empty')
    }).catch((error) => {
      if (!current || error.code === 'ABORTED') return
      setBusinessError(error)
      setBusinessState('error')
    })
    return () => { current = false; controller.abort() }
  }, [token, allowed, isBusiness, businessRetry])

  useEffect(() => {
    if (shouldFocusError.current && !isSubmitting) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
      shouldFocusError.current = false
    }
  }, [errors, imageError, isSubmitting])

  useEffect(() => {
    if (savedCampaign) success.current?.focus()
  }, [savedCampaign])

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    if (!uncertainSubmission) setSubmissionError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current || categoryState !== 'ready' || !token || !allowed || (isBusiness && businessState !== 'ready') || (uncertainSubmission && !retryAcknowledged)) return
    const nextErrors = validateCampaignSubmission(values, categories)
    setErrors(nextErrors)
    setSubmissionError(null)
    shouldFocusError.current = Object.keys(nextErrors).length > 0 || Boolean(imageError)
    if (shouldFocusError.current) return

    inFlight.current = true
    setIsSubmitting(true)
    setSubmitStage(imageFile ? 'Uploading photo…' : 'Submitting…')
    const version = ++requestVersion.current
    const controller = new AbortController()
    submissionController.current = controller
    let campaignPostStarted = false
    try {
      let image = uploadedImage.current
      if (imageFile && (!image || Date.parse(image.expiresAt) <= Date.now())) {
        image = await uploadCampaignImage(imageFile, { token, signal: controller.signal })
        if (version !== requestVersion.current) return
        uploadedImage.current = image
      }
      setSubmitStage('Submitting…')
      campaignPostStarted = true
      const campaign = await submitCampaign({
        title: values.title.trim(),
        description: values.description.trim(),
        categoryId: Number(values.categoryId),
        startDate: values.startDate,
        endDate: values.endDate,
        ...(values.targetAudience.trim() ? { targetAudience: values.targetAudience.trim() } : {}),
        ...(imageFile && image ? { imageId: image.imageId } : {}),
      }, { token, signal: controller.signal })
      if (version === requestVersion.current) {
        setSavedCampaign(campaign)
        setUncertainSubmission(false)
        setRetryAcknowledged(false)
      }
    } catch (error) {
      if (version !== requestVersion.current || error.code === 'ABORTED') return
      const fieldErrors = Object.fromEntries(Object.entries(error.fieldErrors || {}).filter(([field]) => Object.hasOwn(initialValues, field)))
      if (error.fieldErrors?.imageId || error.fieldErrors?.file) {
        setImageError(error.fieldErrors.imageId || error.fieldErrors.file)
        uploadedImage.current = null
      }
      setErrors(fieldErrors)
      shouldFocusError.current = Object.keys(fieldErrors).length > 0 || Boolean(error.fieldErrors?.imageId || error.fieldErrors?.file)
      setSubmissionError(error)
      if (campaignPostStarted) setUncertainSubmission(['NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code) || error.status >= 500)
      setRetryAcknowledged(false)
    } finally {
      if (version === requestVersion.current) {
        inFlight.current = false
        setIsSubmitting(false)
        submissionController.current = null
      }
    }
  }

  function fieldProps(name) {
    return {
      name,
      value: values[name],
      onChange: handleChange,
      'aria-invalid': Boolean(errors[name]),
      'aria-describedby': errors[name] ? `submission-${name}-error` : undefined,
    }
  }

  function fieldError(name) {
    return errors[name] ? <p id={`submission-${name}-error`} className="campaign-form-error">{errors[name]}</p> : null
  }

  if (!token) {
    return (
      <section className="campaign-form-page content-width" aria-labelledby="campaign-form-title">
        <div className="campaign-form-card">
          <h1 id="campaign-form-title">Create a campaign</h1>
          <p>Log in to submit a {isBusiness ? 'business' : 'social-cause'} campaign for review.</p>
          <a className="text-link" href={loginPath}>Log in</a>
        </div>
      </section>
    )
  }

  if (!allowed) return (
    <section className="campaign-form-page content-width" aria-labelledby="campaign-form-title"><div className="campaign-form-card">
      <h1 id="campaign-form-title">Create a campaign</h1>
      <p>{isBusiness ? 'A business-owner account is needed to post a business campaign.' : 'A public-user account is needed to post a social-cause campaign.'}</p>
      {role === 'business_owner' ? <a className="text-link" href="/business/campaigns/new">Create a business campaign</a> : <a className="text-link" href="/">Back to home</a>}
    </div></section>
  )

  return (
    <section className="campaign-form-page content-width" aria-labelledby="campaign-form-title">
      <div className="campaign-form-card">
        <div className="campaign-form-intro">
          <p className="campaign-form-eyebrow">{isBusiness ? 'Small-business campaign' : 'Social-cause campaign'}</p>
          <h1 id="campaign-form-title">{isBusiness ? 'Create a business campaign' : 'Create a campaign'}</h1>
          <p>Submit your campaign details for administrator review. It will appear publicly only after approval.</p>
        </div>

        {isBusiness && businessState !== 'ready' ? (
          <div className="campaign-profile-state" role={businessState === 'error' ? 'alert' : 'status'}>
            {businessState === 'loading' ? <p>Loading your business profile…</p> : null}
            {businessState === 'empty' ? <><h2>Add your business details first</h2><p>Your campaign needs a business profile so people know who is behind it.</p><a className="text-link" href="/business/profile">Set up business profile</a></> : null}
            {businessState === 'error' ? <><p>{businessError.message}</p>{businessError.status === 401 ? <a className="text-link" href={loginPath}>Log in again</a> : <button className="campaign-secondary-button" type="button" onClick={() => setBusinessRetry((value) => value + 1)}>Retry business profile</button>}</> : null}
          </div>
        ) : savedCampaign ? (
          <div ref={success} className="campaign-form-success" role="status" tabIndex="-1">
            <h2>Campaign submitted</h2>
            <p>“{savedCampaign.title}” was saved as campaign #{savedCampaign.id}.</p>
            <p>Status: pending review. It is not publicly visible yet.</p>
            <div className="campaign-submission-followup">
              <button type="button" className="campaign-secondary-button" onClick={() => { setValues(initialValues); setErrors({}); setImageFile(null); setImageError(''); uploadedImage.current = null; setSubmissionError(null); setSavedCampaign(null); setUncertainSubmission(false); setRetryAcknowledged(false) }}>Create another campaign</button>
              <a className="text-link" href="/my-campaigns">My campaigns</a>
            </div>
          </div>
        ) : (
          <>
            {isBusiness ? <div className="campaign-posting-context"><p>Posting for <strong>{business.businessName}</strong></p><a className="text-link" href="/business/profile">Edit business profile</a></div> : null}
            {categoryState === 'loading' ? <p role="status">Loading categories…</p> : null}
            {categoryState === 'error' || categoryState === 'empty' ? (
              <div className="campaign-category-state" role={categoryState === 'error' ? 'alert' : 'status'}>
                <p>{categoryState === 'error' ? categoryError : 'No categories are available yet. Please check again later.'}</p>
                <button type="button" className="campaign-secondary-button" onClick={() => setCategoryRetry((value) => value + 1)}>Retry categories</button>
              </div>
            ) : null}
            <form ref={form} onSubmit={handleSubmit} noValidate aria-label="Campaign submission form">
              <fieldset className="campaign-form" disabled={isSubmitting}>
                <legend className="visually-hidden">Campaign details</legend>
                <div className="campaign-form-field campaign-form-field--full">
                  <label htmlFor="submission-title">Campaign title</label>
                  <input id="submission-title" maxLength="150" {...fieldProps('title')} />
                  {fieldError('title')}
                </div>
                <div className="campaign-form-field campaign-form-field--full">
                  <label htmlFor="submission-description">Description</label>
                  <textarea id="submission-description" rows="6" maxLength="5000" {...fieldProps('description')} />
                  {fieldError('description')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="submission-category">Category</label>
                  <select id="submission-category" disabled={categoryState !== 'ready'} {...fieldProps('categoryId')}>
                    <option value="">Choose a category</option>
                    {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  {fieldError('categoryId')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="submission-audience">Target audience <span>(optional)</span></label>
                  <input id="submission-audience" maxLength="255" {...fieldProps('targetAudience')} />
                  {fieldError('targetAudience')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="submission-start">Start date</label>
                  <input id="submission-start" type="date" min="1000-01-01" max="9999-12-31" {...fieldProps('startDate')} />
                  {fieldError('startDate')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="submission-end">End date</label>
                  <input id="submission-end" type="date" min="1000-01-01" max="9999-12-31" {...fieldProps('endDate')} />
                  {fieldError('endDate')}
                </div>
                <CampaignImageInput file={imageFile} error={imageError} disabled={isSubmitting} onError={setImageError} onChange={(file) => {
                  setImageFile(file); uploadedImage.current = null; if (!uncertainSubmission) setSubmissionError(null)
                }} />
                {uncertainSubmission ? <div className="campaign-category-state campaign-form-field--full" role="alert">
                  <p>Your campaign may already have been saved. Check My campaigns before submitting again; another submission could create a duplicate.</p>
                  <p><a className="text-link" href="/my-campaigns" target="_blank" rel="noopener noreferrer">Check My campaigns (opens a new tab)</a></p>
                  <label><input type="checkbox" checked={retryAcknowledged} onChange={(event) => setRetryAcknowledged(event.target.checked)} /> I understand the duplicate risk and want to submit again.</label>
                </div> : null}
                <div className="campaign-form-actions campaign-form-field--full">
                  <button type="submit" disabled={isSubmitting || categoryState !== 'ready' || (uncertainSubmission && !retryAcknowledged)}>{isSubmitting ? submitStage : 'Submit campaign for review'}</button>
                </div>
              </fieldset>
              {submissionError ? (
                <div className="campaign-submission-error" role="alert">
                  {!uncertainSubmission || submissionError.status < 500 ? <p>{submissionError.message}</p> : null}
                  {submissionError.status === 401 ? <a className="text-link" href={loginPath}>Log in again</a> : null}
                </div>
              ) : null}
            </form>
          </>
        )}
      </div>
    </section>
  )
}
