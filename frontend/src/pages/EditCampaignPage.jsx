import { useEffect, useRef, useState } from 'react'
import { loadOwnedCampaign, saveOwnedCampaign, deleteOwnedCampaign } from '../services/ownedCampaignService.js'
import { loadCampaignCategories, uploadCampaignImage } from '../services/campaignSubmissionService.js'
import { validateCampaignSubmission } from '../services/campaignSubmissionValidation.js'
import { authPagePath } from '../services/authSession.js'
import CampaignImageInput from '../components/CampaignImageInput.jsx'
import '../styles/campaign-posting.css'

const fields = ['title', 'description', 'categoryId', 'targetAudience', 'startDate', 'endDate']
export default function EditCampaignPage({ campaignId, token, role }) {
  const allowed = ['public', 'business_owner'].includes(role)
  const [campaign, setCampaign] = useState(null), [categories, setCategories] = useState([])
  const [values, setValues] = useState({}), [errors, setErrors] = useState({})
  const [error, setError] = useState(null), [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState(''), [uncertain, setUncertain] = useState(false)
  const [file, setFile] = useState(null), [imageError, setImageError] = useState(''), [removeImage, setRemoveImage] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false), [deleteName, setDeleteName] = useState('')
  const request = useRef(null), version = useRef(0), inFlight = useRef(false), uploaded = useRef(null), form = useRef(null), result = useRef(null)
  const shouldFocusError = useRef(false)
  const loginPath = authPagePath('/login', `/my-campaigns/${campaignId}/edit`)
  useEffect(() => {
    const current = ++version.current, controller = new AbortController()
    request.current?.abort(); request.current = controller; inFlight.current = false
    setCampaign(null); setLoading(true); setBusy(false); setError(null); setErrors({}); setOutcome(''); setUncertain(false)
    setFile(null); setRemoveImage(false); setImageError(''); uploaded.current = null; setConfirmDelete(false); setDeleteName('')
    if (token && allowed) Promise.all([
      loadOwnedCampaign(campaignId, { token, signal: controller.signal }),
      loadCampaignCategories({ signal: controller.signal }),
    ]).then(([item, choices]) => {
      if (current !== version.current || controller.signal.aborted) return
      setCampaign(item); setCategories(choices)
      setValues(Object.fromEntries(fields.map(key => [key, String(item[key] ?? '')])))
    }).catch(failure => { if (!controller.signal.aborted && current === version.current) setError(failure) })
      .finally(() => { if (!controller.signal.aborted && current === version.current) setLoading(false) })
    else setLoading(false)
    return () => { controller.abort(); request.current?.abort(); version.current += 1 }
  }, [campaignId, token, role, allowed, reload])
  useEffect(() => {
    if (shouldFocusError.current && !busy) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
      shouldFocusError.current = false
    }
  }, [errors, imageError, busy])
  useEffect(() => { if (outcome) result.current?.focus() }, [outcome])
  const blocked = uncertain || [401, 403, 404].includes(error?.status)

  function change(event) { const { name, value } = event.target; setValues(v => ({ ...v, [name]: value })); setErrors(v => ({ ...v, [name]: '' })) }
  function field(name) { return { name, value: values[name] || '', onChange: change, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `edit-${name}-error` : undefined } }
  function fieldError(name) { return errors[name] ? <p id={`edit-${name}-error`} className="campaign-form-error">{errors[name]}</p> : null }
  async function write(remove = false) {
    if (inFlight.current || blocked || outcome || !campaign || !token || !allowed) return
    if (remove && (!confirmDelete || deleteName !== campaign.title)) return
    if (!remove && confirmDelete) return
    const validation = remove ? {} : validateCampaignSubmission(values, categories)
    shouldFocusError.current = !remove && (Object.keys(validation).length > 0 || Boolean(imageError))
    setErrors(validation)
    if (Object.keys(validation).length || (!remove && imageError)) return
    const current = version.current, controller = new AbortController()
    request.current = controller; inFlight.current = true; setBusy(true); setError(null)
    let writing = false
    try {
      if (remove) {
        writing = true
        await deleteOwnedCampaign(campaignId, campaign.updatedAt, { token, signal: controller.signal })
      } else {
        if (file && (!uploaded.current || Date.parse(uploaded.current.expiresAt) <= Date.now())) {
          const image = await uploadCampaignImage(file, { token, signal: controller.signal })
          if (controller.signal.aborted || current !== version.current) return
          uploaded.current = image
        }
        if (controller.signal.aborted || current !== version.current) return
        writing = true
        await saveOwnedCampaign(campaignId, {
          ...Object.fromEntries(fields.map(key => [key, key === 'categoryId' ? Number(values[key]) : values[key].trim()])),
          expectedUpdatedAt: campaign.updatedAt,
          ...(file ? { imageId: uploaded.current.imageId } : removeImage ? { removeImage: true } : {}),
        }, { token, signal: controller.signal })
      }
      if (!controller.signal.aborted && current === version.current) setOutcome(remove ? 'deleted' : 'saved')
    } catch (failure) {
      if (controller.signal.aborted || current !== version.current) return
      setError(failure)
      setErrors(Object.fromEntries(Object.entries(failure.fieldErrors || {}).filter(([key]) => fields.includes(key))))
      shouldFocusError.current = Boolean(Object.keys(failure.fieldErrors || {}).some(key => fields.includes(key) || ['imageId', 'file'].includes(key)))
      if (failure.fieldErrors?.imageId || failure.fieldErrors?.file) { uploaded.current = null; setImageError(failure.fieldErrors.imageId || failure.fieldErrors.file) }
      if (failure.status === 409 || (writing && (failure.code === 'INVALID_RESPONSE' || !failure.status || failure.status >= 500))) setUncertain(true)
    } finally {
      if (current === version.current) { inFlight.current = false; setBusy(false) }
    }
  }
  if (!token || !allowed) return <section className="campaign-form-page content-width"><h1>Edit campaign</h1><p>{token ? 'Only campaign authors can use this page.' : 'Log in to manage your campaign.'}</p><a href={token ? '/' : loginPath}>{token ? 'Back to home' : 'Log in'}</a></section>
  return <section className="campaign-form-page content-width" aria-labelledby="edit-title"><div className="campaign-form-card">
    <a className="text-link" href="/my-campaigns">← My campaigns</a><h1 id="edit-title">Edit campaign</h1>
    {loading ? <p role="status">Loading your campaign…</p> : null}
    {outcome ? <div ref={result} role="status" tabIndex="-1"><h2>{outcome === 'deleted' ? 'Campaign removed' : 'Changes submitted for review'}</h2><p>{outcome === 'deleted' ? 'Your campaign is no longer visible. Its records are retained by the service.' : 'The campaign is pending review and is not publicly visible until approved again.'}</p><a href="/my-campaigns">Back to My campaigns</a></div> : <>
      {error ? <div role="alert"><p>{error.status === 404 ? 'This campaign is unavailable or does not belong to your account.' : error.message}</p>{uncertain ? <p>We cannot safely apply another change yet. Reload to check the saved version; unsaved edits will be discarded.</p> : null}{error.status === 401 ? <a href={loginPath}>Log in again</a> : <button type="button" disabled={busy} onClick={() => setReload(n => n + 1)}>Reload saved campaign</button>}</div> : null}
      {campaign ? <><p>Current status: <strong>{campaign.status}</strong>. Saving any changes submits this campaign for review. An approved campaign will leave the public list until it is approved again.</p>
        {campaign.review?.comments ? <p><strong>Review feedback:</strong> {campaign.review.comments}</p> : null}
        <form ref={form} noValidate aria-label="Edit campaign form" onSubmit={event => { event.preventDefault(); write() }}>
          <fieldset className="campaign-form" disabled={busy || blocked || confirmDelete}><legend className="visually-hidden">Campaign details</legend>
            <div className="campaign-form-field campaign-form-field--full"><label htmlFor="edit-title-input">Campaign title</label><input id="edit-title-input" maxLength="150" {...field('title')} />{fieldError('title')}</div>
            <div className="campaign-form-field campaign-form-field--full"><label htmlFor="edit-description">Description</label><textarea id="edit-description" rows="6" maxLength="5000" {...field('description')} />{fieldError('description')}</div>
            <div className="campaign-form-field"><label htmlFor="edit-category">Category</label><select id="edit-category" {...field('categoryId')}><option value="">Choose a category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{fieldError('categoryId')}</div>
            <div className="campaign-form-field"><label htmlFor="edit-audience">Target audience (optional)</label><input id="edit-audience" maxLength="255" {...field('targetAudience')} />{fieldError('targetAudience')}</div>
            <div className="campaign-form-field"><label htmlFor="edit-start">Start date</label><input id="edit-start" type="date" min="1000-01-01" max="9999-12-31" {...field('startDate')} />{fieldError('startDate')}</div>
            <div className="campaign-form-field"><label htmlFor="edit-end">End date</label><input id="edit-end" type="date" min="1000-01-01" max="9999-12-31" {...field('endDate')} />{fieldError('endDate')}</div>
            {campaign.imageUrl && !file ? <div className="campaign-form-field campaign-form-field--full"><img className="campaign-management__image" src={campaign.imageUrl} alt="Current campaign photo" /><label><input type="checkbox" checked={removeImage} onChange={e => setRemoveImage(e.target.checked)} /> Remove the current photo when saving</label></div> : null}
            <CampaignImageInput file={file} onChange={value => { setFile(value); uploaded.current = null; if (value) setRemoveImage(false) }} error={imageError} onError={setImageError} disabled={busy || blocked || confirmDelete} />
            <button className="campaign-submit-button" disabled={!categories.length} type="submit">{busy ? 'Saving…' : campaign.status === 'rejected' ? 'Resubmit for review' : 'Save and submit for review'}</button>
          </fieldset>
        </form>
        <div className="campaign-category-state"><h2>Remove this campaign</h2><p>Removal hides the campaign from browsing and your active submissions. It does not permanently erase its history.</p>
          {confirmDelete ? <div role="group" aria-label="Confirm campaign removal"><label htmlFor="delete-campaign-name">Type “{campaign.title}” to confirm</label><input id="delete-campaign-name" value={deleteName} disabled={busy || blocked} onChange={e => setDeleteName(e.target.value)} /><button type="button" disabled={busy || blocked || deleteName !== campaign.title} onClick={() => write(true)}>Confirm removal</button><button type="button" disabled={busy} onClick={() => { setConfirmDelete(false); setDeleteName('') }}>Cancel</button></div> : <button type="button" disabled={busy || blocked} onClick={() => setConfirmDelete(true)}>Remove campaign</button>}
        </div>
      </> : null}
    </>}
  </div></section>
}
