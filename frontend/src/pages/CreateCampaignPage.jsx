import { useEffect, useRef, useState } from 'react'
import { loadCampaignCategories, submitCampaign } from '../services/campaignSubmissionService.js'
import { validateCampaignSubmission } from '../services/campaignSubmissionValidation.js'

const initialValues = {
  title: '', description: '', categoryId: '', targetAudience: '', startDate: '', endDate: '',
}

export default function CreateCampaignPage({ token = localStorage.getItem('token') }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [categories, setCategories] = useState([])
  const [categoryState, setCategoryState] = useState('loading')
  const [categoryError, setCategoryError] = useState('')
  const [categoryRetry, setCategoryRetry] = useState(0)
  const [submissionError, setSubmissionError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savedCampaign, setSavedCampaign] = useState(null)
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
    return () => {
      requestVersion.current += 1
      submissionController.current?.abort()
    }
  }, [token])

  useEffect(() => {
    if (!token) return undefined
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
  }, [token, categoryRetry])

  useEffect(() => {
    if (shouldFocusError.current && !isSubmitting) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
      shouldFocusError.current = false
    }
  }, [errors, isSubmitting])

  useEffect(() => {
    if (savedCampaign) success.current?.focus()
  }, [savedCampaign])

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setSubmissionError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current || categoryState !== 'ready' || !token) return
    const nextErrors = validateCampaignSubmission(values, categories)
    setErrors(nextErrors)
    setSubmissionError(null)
    shouldFocusError.current = Object.keys(nextErrors).length > 0
    if (shouldFocusError.current) return

    inFlight.current = true
    setIsSubmitting(true)
    const version = ++requestVersion.current
    const controller = new AbortController()
    submissionController.current = controller
    try {
      const campaign = await submitCampaign({
        title: values.title.trim(),
        description: values.description.trim(),
        categoryId: Number(values.categoryId),
        startDate: values.startDate,
        endDate: values.endDate,
        ...(values.targetAudience.trim() ? { targetAudience: values.targetAudience.trim() } : {}),
      }, { token, signal: controller.signal })
      if (version === requestVersion.current) setSavedCampaign(campaign)
    } catch (error) {
      if (version !== requestVersion.current || error.code === 'ABORTED') return
      const fieldErrors = Object.fromEntries(Object.entries(error.fieldErrors || {}).filter(([field]) => Object.hasOwn(initialValues, field)))
      setErrors(fieldErrors)
      shouldFocusError.current = Object.keys(fieldErrors).length > 0
      setSubmissionError(error)
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
          <p>Log in to submit a social-cause campaign for review.</p>
          <a className="text-link" href="/login">Log in</a>
        </div>
      </section>
    )
  }

  return (
    <section className="campaign-form-page content-width" aria-labelledby="campaign-form-title">
      <div className="campaign-form-card">
        <div className="campaign-form-intro">
          <p className="campaign-form-eyebrow">Social-cause campaign</p>
          <h1 id="campaign-form-title">Create a campaign</h1>
          <p>Submit your campaign details for administrator review. It will appear publicly only after approval.</p>
          <p className="campaign-form-help">This form accepts text details. Photo uploads and business campaign posting are not available yet.</p>
        </div>

        {savedCampaign ? (
          <div ref={success} className="campaign-form-success" role="status" tabIndex="-1">
            <h2>Campaign submitted</h2>
            <p>“{savedCampaign.title}” was saved as campaign #{savedCampaign.id}.</p>
            <p>Status: pending review. It is not publicly visible yet.</p>
            <div className="campaign-submission-followup">
              <button type="button" className="campaign-secondary-button" onClick={() => { setValues(initialValues); setErrors({}); setSubmissionError(null); setSavedCampaign(null) }}>Create another campaign</button>
              <a className="text-link" href="/#campaigns">Back to campaigns</a>
            </div>
          </div>
        ) : (
          <>
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
                <div className="campaign-form-actions campaign-form-field--full">
                  <button type="submit" disabled={isSubmitting || categoryState !== 'ready'}>{isSubmitting ? 'Submitting…' : 'Submit campaign for review'}</button>
                </div>
              </fieldset>
              {submissionError ? (
                <div className="campaign-submission-error" role="alert">
                  <p>{submissionError.message}</p>
                  {submissionError.status === 401 ? <a className="text-link" href="/login">Log in again</a> : null}
                </div>
              ) : null}
            </form>
          </>
        )}
      </div>
    </section>
  )
}
