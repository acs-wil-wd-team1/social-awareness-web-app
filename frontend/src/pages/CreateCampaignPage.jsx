import { useEffect, useRef, useState } from 'react'
import { sampleAccounts, sampleCategories, submitSampleCampaign, validateDraftCampaign, validateDraftImage } from '../drafts/campaignSubmissionDraft.js'

const initialValues = {
  title: '', description: '', categoryId: '', targetAudience: '', startDate: '', endDate: '',
}

export default function CreateCampaignPage({ submitSample = submitSampleCampaign }) {
  const [sampleAccount, setSampleAccount] = useState('public')
  const [simulateError, setSimulateError] = useState(false)
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [submissionError, setSubmissionError] = useState('')
  const [sampleResult, setSampleResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imagePreviewError, setImagePreviewError] = useState('')
  const fileInput = useRef(null)
  const form = useRef(null)
  const focusInvalidField = useRef(false)
  const inFlight = useRef(false)
  const requestVersion = useRef(0)
  const account = sampleAccounts[sampleAccount]
  const canPreviewForm = sampleAccount === 'public' || sampleAccount === 'business'

  useEffect(() => () => { requestVersion.current += 1 }, [])

  useEffect(() => {
    if (focusInvalidField.current) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
      focusInvalidField.current = false
    }
  }, [errors])

  useEffect(() => {
    if (!imageFile || validateDraftImage(imageFile)) {
      setImagePreview('')
      return undefined
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  function clearFeedback() {
    setSampleResult(null)
    setSubmissionError('')
  }

  function handleChange(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    clearFeedback()
  }

  function changeSampleAccount(event) {
    setSampleAccount(event.target.value)
    setValues(initialValues)
    setErrors({})
    setImageFile(null)
    setImagePreviewError('')
    if (fileInput.current) fileInput.current.value = ''
    clearFeedback()
  }

  function selectImage(event) {
    const file = event.target.files?.[0] ?? null
    setImageFile(file)
    setImagePreviewError('')
    setErrors((current) => ({ ...current, image: validateDraftImage(file) }))
    clearFeedback()
  }

  function removeImage() {
    setImageFile(null)
    setImagePreviewError('')
    setErrors((current) => ({ ...current, image: '' }))
    if (fileInput.current) fileInput.current.value = ''
    clearFeedback()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current || !canPreviewForm) return
    const nextErrors = { ...validateDraftCampaign(values), image: validateDraftImage(imageFile) || imagePreviewError }
    focusInvalidField.current = Object.values(nextErrors).some(Boolean)
    setErrors(nextErrors)
    clearFeedback()
    if (Object.values(nextErrors).some(Boolean)) return

    inFlight.current = true
    setIsSubmitting(true)
    const version = ++requestVersion.current
    const payload = {
      title: values.title.trim(),
      description: values.description.trim(),
      categoryId: Number(values.categoryId),
      startDate: values.startDate,
      endDate: values.endDate,
      ...(values.targetAudience.trim() ? { targetAudience: values.targetAudience.trim() } : {}),
    }
    // A future upload API must supply a real imageId; local selection does not create one.
    try {
      const result = await submitSample(payload, { sampleAccount, simulateError })
      if (version !== requestVersion.current) return
      if (!result?.sampleOnly || result.campaign?.status !== 'pending') {
        throw new Error('The sample response could not be shown. Please try again.')
      }
      setSampleResult(result.campaign)
    } catch (error) {
      if (version !== requestVersion.current) return
      if (error?.fieldErrors) {
        focusInvalidField.current = true
        setErrors((current) => ({ ...current, ...error.fieldErrors }))
      }
      setSubmissionError(error?.message ?? 'The sample could not be shown. Please try again.')
    } finally {
      inFlight.current = false
      if (version === requestVersion.current) setIsSubmitting(false)
    }
  }

  function fieldError(name) {
    return errors[name] ? <p id={`campaign-${name}-error`} className="campaign-form-error">{errors[name]}</p> : null
  }

  function fieldAccessibility(name) {
    return {
      'aria-invalid': Boolean(errors[name]),
      'aria-describedby': errors[name] ? `campaign-${name}-error` : undefined,
    }
  }

  return (
    <section className="campaign-form-page content-width" aria-labelledby="campaign-form-title">
      <div className="campaign-form-card">
        <p className="campaign-draft-notice">Frontend draft — uses sample data; nothing is sent or saved</p>
        <div className="campaign-form-intro">
          <p className="campaign-form-eyebrow">Campaign form preview</p>
          <h1 id="campaign-form-title">Create a campaign</h1>
          <p>Try the proposed form and review states before connecting the backend.</p>
        </div>

        <div className="campaign-draft-controls">
          <div className="campaign-form-field">
            <label htmlFor="sample-account">Sample account</label>
            <select id="sample-account" value={sampleAccount} onChange={changeSampleAccount} disabled={isSubmitting}>
              {Object.entries(sampleAccounts).map(([key, sample]) => <option key={key} value={key}>{sample.label}</option>)}
            </select>
          </div>
          <p className="campaign-form-help">These are sample views. This selector does not change your login or grant permissions.</p>
          {canPreviewForm ? (
            <label className="campaign-draft-error-option">
              <input type="checkbox" checked={simulateError} onChange={(event) => { setSimulateError(event.target.checked); clearFeedback() }} disabled={isSubmitting} />
              Try a sample submission error
            </label>
          ) : null}
        </div>

        {sampleAccount === 'guest' ? (
          <div className="campaign-draft-account-notice" role="status">
            <h2>Guest preview</h2>
            <p>The proposed flow asks guests to log in before posting. Choose a sample user above to try the form.</p>
          </div>
        ) : null}
        {sampleAccount === 'business-missing' ? (
          <div className="campaign-draft-account-notice" role="status">
            <h2>Business profile needed</h2>
            <p>A business profile is needed before posting a business campaign. That setup flow is still to be agreed.</p>
          </div>
        ) : null}

        {canPreviewForm ? (
          <>
            <p className="campaign-draft-context">
              {account.type === 'business' ? `Small-business campaign for ${account.businessName} (sample).` : 'Social-cause campaign from a public user (sample).'}
              {' '}The backend will determine the campaign type and ownership from the signed-in account.
            </p>
            <form ref={form} onSubmit={handleSubmit} noValidate aria-label="Sample campaign form">
              <fieldset className="campaign-form" disabled={isSubmitting}>
                <legend className="visually-hidden">Sample campaign details</legend>
                <div className="campaign-form-field campaign-form-field--full">
                  <label htmlFor="campaign-title">Campaign title</label>
                  <input id="campaign-title" name="title" value={values.title} onChange={handleChange} maxLength="150" {...fieldAccessibility('title')} />
                  {fieldError('title')}
                </div>
                <div className="campaign-form-field campaign-form-field--full">
                  <label htmlFor="campaign-description">Description</label>
                  <textarea id="campaign-description" name="description" value={values.description} onChange={handleChange} rows="6" maxLength="5000" {...fieldAccessibility('description')} />
                  {fieldError('description')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="campaign-category">Category</label>
                  <select id="campaign-category" name="categoryId" value={values.categoryId} onChange={handleChange} {...fieldAccessibility('categoryId')}>
                    <option value="">Choose a category</option>
                    {sampleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                  {fieldError('categoryId')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="campaign-audience">Target audience <span>(optional)</span></label>
                  <input id="campaign-audience" name="targetAudience" value={values.targetAudience} onChange={handleChange} maxLength="255" {...fieldAccessibility('targetAudience')} />
                  {fieldError('targetAudience')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="campaign-start-date">Start date</label>
                  <input id="campaign-start-date" name="startDate" type="date" value={values.startDate} onChange={handleChange} {...fieldAccessibility('startDate')} />
                  {fieldError('startDate')}
                </div>
                <div className="campaign-form-field">
                  <label htmlFor="campaign-end-date">End date</label>
                  <input id="campaign-end-date" name="endDate" type="date" value={values.endDate} onChange={handleChange} {...fieldAccessibility('endDate')} />
                  {fieldError('endDate')}
                </div>
                <div className="campaign-form-field campaign-form-field--full">
                  <label htmlFor="campaign-image">Campaign photo <span>(optional)</span></label>
                  <input ref={fileInput} id="campaign-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} aria-invalid={Boolean(errors.image || imagePreviewError)} aria-describedby="campaign-image-help campaign-image-error" />
                  <p id="campaign-image-help" className="campaign-form-help">JPEG, PNG or WebP, up to 5 MB (proposed). Preview only; the file stays in this browser.</p>
                  <p id="campaign-image-error" className="campaign-form-error">{errors.image || imagePreviewError}</p>
                  {imagePreview ? <img className="campaign-draft-image" src={imagePreview} alt="Selected campaign photo preview" onError={() => setImagePreviewError('This image could not be previewed. Choose another file.')} /> : null}
                  {imageFile ? <button type="button" className="campaign-draft-remove-image" onClick={removeImage}>Remove photo</button> : null}
                </div>
                <div className="campaign-form-actions campaign-form-field--full">
                  <button type="submit">{isSubmitting ? 'Showing sample…' : 'Preview submission'}</button>
                </div>
              </fieldset>
              <p className="campaign-form-help campaign-draft-upload-note">Photo uploads will need a separate API that returns an image ID. This draft does not upload a file or make up an image ID.</p>
              {submissionError ? <p className="campaign-form-error" role="alert">{submissionError}</p> : null}
              {sampleResult ? (
                <div className="campaign-form-success" role="status">
                  <h2>Sample result: pending review</h2>
                  <p>“{sampleResult.title}” would wait for administrator approval before appearing publicly.</p>
                  <p>This is a preview only. No campaign was created, no photo was uploaded and nothing was saved.</p>
                </div>
              ) : null}
            </form>
          </>
        ) : null}
      </div>
    </section>
  )
}
