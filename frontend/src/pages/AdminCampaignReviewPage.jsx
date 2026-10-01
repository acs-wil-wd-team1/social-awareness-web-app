import { useEffect, useRef, useState } from 'react'
import {
  deleteCampaign, formatCampaignDate, loadAdminCampaign, loadCampaignReviews,
  managementErrorMessage, reviewCampaign, unpublishCampaign,
} from '../services/campaignManagementService.js'
import AdminActionDialog from '../components/AdminActionDialog.jsx'
import CampaignReviewHistory from '../components/CampaignReviewHistory.jsx'
import '../styles/campaign-management.css'

export default function AdminCampaignReviewPage({
  token, role, campaignId, campaignLoader = loadAdminCampaign, decisionSender = reviewCampaign,
  historyLoader = loadCampaignReviews, unpublishSender = unpublishCampaign, deleteSender = deleteCampaign,
}) {
  const [campaign, setCampaign] = useState(null)
  const [requestState, setRequestState] = useState('loading')
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [decision, setDecision] = useState('')
  const [comments, setComments] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [reloadRequired, setReloadRequired] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [contentAction, setContentAction] = useState(null)
  const [actionReason, setActionReason] = useState('')
  const [actionError, setActionError] = useState('')
  const [deleted, setDeleted] = useState(false)
  const mutation = useRef(null)
  const saveLock = useRef(false)
  const confirmation = useRef(null)
  const outcome = useRef(null)

  useEffect(() => {
    if (!token || role !== 'admin') return undefined
    const controller = new AbortController()
    setCampaign(null)
    setRequestState('loading')
    setError(null)
    setDecision('')
    setComments('')
    setConfirming(false)
    setSaving(false)
    saveLock.current = false
    setSaveError('')
    setReloadRequired(false)
    setImageFailed(false)
    setContentAction(null); setActionReason(''); setActionError(''); setDeleted(false)
    campaignLoader(campaignId, { token, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return
        setCampaign(response)
        setRequestState('success')
      })
      .catch((failure) => {
        if (controller.signal.aborted) return
        setError(failure)
        setRequestState('error')
      })
    return () => controller.abort()
  }, [token, role, campaignId, retry, campaignLoader])

  useEffect(() => {
    setNotice('')
    return () => {
      mutation.current?.abort()
      saveLock.current = false
    }
  }, [campaignId, token, role])

  useEffect(() => {
    if (confirming) confirmation.current?.focus()
  }, [confirming])

  useEffect(() => {
    if (notice && !saving) outcome.current?.focus()
  }, [notice, saving])

  function prepareDecision(event) {
    event.preventDefault()
    if (saving || reloadRequired || campaign?.status !== 'pending') return
    const reason = comments.trim()
    if (!decision) {
      setSaveError('Choose whether to approve or reject this campaign.')
      return
    }
    if (decision === 'rejected' && !reason) {
      setSaveError('Please explain why this campaign is being rejected.')
      return
    }
    if (reason.length > 2000) {
      setSaveError('Keep your comments to 2,000 characters or fewer.')
      return
    }
    setSaveError('')
    setConfirming(true)
  }

  async function saveDecision() {
    if (saveLock.current || !confirming || reloadRequired || campaign?.status !== 'pending') return
    saveLock.current = true
    const controller = new AbortController()
    mutation.current = controller
    setSaving(true)
    setSaveError('')
    try {
      const response = await decisionSender(campaign.id, { status: decision, comments: comments.trim(), expectedUpdatedAt: campaign.updatedAt }, {
        token, signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setCampaign((current) => ({ ...current, ...response.campaign, review: response.review }))
      setConfirming(false)
      setHistoryRefresh((value) => value + 1)
      setNotice(decision === 'approved'
        ? 'Campaign approved. It is now available publicly.'
        : 'Campaign rejected. Your feedback has been saved for the campaign author.')
    } catch (failure) {
      if (controller.signal.aborted) return
      setConfirming(false)
      if (failure?.status === 409) {
        setNotice('This campaign changed after you opened it. Check its latest content and status before deciding again.')
        setRetry((value) => value + 1)
      } else if (failure?.status === 401 || failure?.status === 403 || failure?.status === 404) {
        setError(failure)
        setRequestState('error')
      } else if (failure?.status === 422) {
        const fieldMessage = [failure.fieldErrors?.comments, failure.fieldErrors?.status].find((message) => typeof message === 'string' && message.trim())
        setSaveError(fieldMessage || 'The review was not accepted. Check your decision and comments, then try again.')
      } else if (failure?.status === 501 || failure?.status === 503) {
        setSaveError('Reviews are temporarily unavailable. Please try again later.')
        setReloadRequired(true)
      } else {
        setSaveError('We could not confirm whether your review was saved. Reload the campaign to check its current status before trying again.')
        setReloadRequired(true)
      }
    } finally {
      if (!controller.signal.aborted) {
        setSaving(false)
        saveLock.current = false
      }
    }
  }

  async function saveContentAction() {
    if (saveLock.current || !contentAction || reloadRequired || !campaign) return
    if (contentAction === 'unpublish' && campaign.status !== 'approved') return
    const reason = actionReason.trim()
    if (!reason || reason.length > 2000) {
      setActionError('Please give a reason of between 1 and 2,000 characters.')
      return
    }
    saveLock.current = true
    const controller = new AbortController()
    mutation.current = controller
    setSaving(true); setSaveError(''); setActionError(''); setNotice('')
    try {
      if (contentAction === 'delete') {
        await deleteSender(campaign.id, reason, { token, signal: controller.signal, expectedUpdatedAt: campaign.updatedAt })
        if (controller.signal.aborted) return
        setDeleted(true)
        setNotice('Campaign deleted from the application. Its records have been retained for audit and recovery.')
      } else {
        const updated = await unpublishSender(campaign.id, reason, { token, signal: controller.signal, expectedUpdatedAt: campaign.updatedAt })
        if (controller.signal.aborted) return
        setCampaign((current) => ({ ...current, ...updated }))
        setDecision(''); setComments(''); setConfirming(false)
        setNotice('Campaign removed from public view. It is pending review and must be approved before it can appear publicly again.')
      }
      setContentAction(null)
    } catch (failure) {
      if (controller.signal.aborted) return
      if (failure.status === 422) {
        setActionError(failure.fieldErrors?.reason || 'Check the reason and try again.')
      } else {
        setContentAction(null)
        if (failure.status === 409) {
          setNotice('This campaign changed while you were reviewing it. Check its latest status below.')
          setRetry((value) => value + 1)
        } else if ([401, 403, 404].includes(failure.status)) {
          setError(failure); setRequestState('error')
        } else {
          setSaveError('We could not confirm whether the campaign changed. Reload its status before trying again.')
          setReloadRequired(true)
        }
      }
    } finally {
      if (!controller.signal.aborted) { setSaving(false); saveLock.current = false }
    }
  }

  if (!token || role !== 'admin') {
    return (
      <section className="campaign-management content-width">
        <h1>{!token ? 'Log in to review this campaign' : 'Admin access required'}</h1>
        <p>Campaign reviews are available to administrators.</p>
        <a className="text-link" href={!token ? `/login?returnTo=${encodeURIComponent(`/admin/campaigns/${campaignId}`)}` : '/'}>{!token ? 'Log in' : 'Back to home'}</a>
      </section>
    )
  }

  return (
    <section className="campaign-management content-width" aria-labelledby="campaign-review-title">
      <a className="back-link" href="/admin/campaigns">← Back to campaign reviews</a>
      <h1 id="campaign-review-title">Campaign review</h1>
      {notice ? <p ref={outcome} className="campaign-management__notice" role="status" tabIndex="-1">{notice}</p> : null}
      {deleted ? <a className="text-link" href="/admin/campaigns">Return to campaign management</a> : null}
      {requestState === 'loading' ? <p role="status">Loading campaign…</p> : null}
      {requestState === 'error' ? (
        <div className="campaign-management__notice" role="alert">
          <h2>{error?.status === 404 ? 'Campaign unavailable' : 'Campaign could not be loaded'}</h2>
          <p>{managementErrorMessage(error)}</p>
          {error?.status === 401 ? <a className="text-link" href={`/login?returnTo=${encodeURIComponent(`/admin/campaigns/${campaignId}`)}`}>Log in again</a>
            : ![403, 404].includes(error?.status) ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button> : null}
        </div>
      ) : null}
      {requestState === 'success' && campaign && !deleted ? (
        <div className="campaign-management__review-layout">
          <article className="campaign-management__card">
            <div className="campaign-management__card-top">
              <span className={`campaign-status campaign-status--${campaign.status}`}>{campaign.status}</span>
              <span className="campaign-management__meta">Campaign #{campaign.id}</span>
            </div>
            <h2>{campaign.title}</h2>
            {campaign.imageUrl && !imageFailed ? <img className="campaign-management__image" src={campaign.imageUrl} alt="Campaign image submitted for review" onError={() => setImageFailed(true)} /> : null}
            {imageFailed ? <div className="campaign-management__notice" role="alert"><p>The submitted image could not be loaded.</p><button type="button" disabled={saving} onClick={() => setRetry((value) => value + 1)}>Reload campaign and image</button></div> : null}
            <p className="campaign-management__description">{campaign.description}</p>
            <dl className="campaign-management__facts">
              <div><dt>Category</dt><dd>{campaign.category || 'Uncategorised'}</dd></div>
              <div><dt>Submitted</dt><dd>{formatCampaignDate(campaign.createdAt)}</dd></div>
              {campaign.createdBy ? <div><dt>Author reference</dt><dd>#{campaign.createdBy}</dd></div> : null}
              {campaign.type ? <div><dt>Campaign type</dt><dd>{campaign.type === 'business' ? 'Small business' : 'Social cause'}</dd></div> : null}
              {campaign.business?.businessName ? <div><dt>Business</dt><dd>{campaign.business.businessName}</dd></div> : null}
              {campaign.startDate ? <div><dt>Starts</dt><dd>{formatCampaignDate(campaign.startDate)}</dd></div> : null}
              {campaign.endDate ? <div><dt>Ends</dt><dd>{formatCampaignDate(campaign.endDate)}</dd></div> : null}
              {campaign.targetAudience ? <div><dt>Target audience</dt><dd>{campaign.targetAudience}</dd></div> : null}
            </dl>
            <CampaignReviewHistory campaignId={campaign.id} token={token} role={role} refreshKey={historyRefresh} historyLoader={historyLoader} />
          </article>
          <aside className="campaign-management__card" aria-labelledby="campaign-decision-title">
            <h2 id="campaign-decision-title">Review decision</h2>
            {campaign.status !== 'pending' ? (
              <>
                <p>This campaign has already been {campaign.status}. No further decision is available here.</p>
                {campaign.review?.comments ? <p className="campaign-management__description"><strong>Review comments:</strong> {campaign.review.comments}</p> : null}
                {campaign.review?.reviewedAt ? <p className="campaign-management__meta">Reviewed {formatCampaignDate(campaign.review.reviewedAt)}</p> : null}
                {campaign.status === 'approved' ? <a className="text-link" href={`/campaigns/${campaign.id}`}>View public campaign</a> : null}
              </>
            ) : (
              <form className="campaign-management__decision" onSubmit={prepareDecision} noValidate>
                <p>Approval makes this campaign public. Rejection keeps it private and sends your feedback to the author’s campaign page.</p>
                <fieldset disabled={saving || confirming || reloadRequired}>
                  <legend>Choose a decision</legend>
                  <label><input type="radio" name="decision" value="approved" checked={decision === 'approved'} onChange={() => { setDecision('approved'); setSaveError('') }} /> Approve campaign</label>
                  <label><input type="radio" name="decision" value="rejected" checked={decision === 'rejected'} onChange={() => { setDecision('rejected'); setSaveError('') }} /> Reject campaign</label>
                </fieldset>
                <label htmlFor="review-comments">{decision === 'rejected' ? 'Reason for rejection (required)' : 'Review comments (optional)'}</label>
                <textarea id="review-comments" value={comments} rows={5} maxLength={2000}
                  required={decision === 'rejected'} disabled={saving || confirming || reloadRequired}
                  aria-describedby={`review-comments-help${saveError ? ' review-error' : ''}`}
                  aria-invalid={Boolean(saveError)} onChange={(event) => { setComments(event.target.value); setSaveError('') }} />
                <p id="review-comments-help" className="campaign-management__meta">Your comments are visible to the campaign author. {comments.length}/2,000 characters.</p>
                {saveError ? <p id="review-error" role="alert" className="campaign-management__error">{saveError}</p> : null}
                {reloadRequired ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Reload campaign status</button>
                  : !confirming ? <button type="submit">Review decision</button> : null}
                {confirming ? (
                  <div className="campaign-management__confirmation" ref={confirmation} tabIndex="-1" aria-labelledby="confirm-review-title">
                    <h3 id="confirm-review-title">{decision === 'approved' ? 'Approve this campaign?' : 'Reject this campaign?'}</h3>
                    <p>“{campaign.title}” will {decision === 'approved' ? 'become publicly visible.' : 'remain private.'}</p>
                    {comments.trim() ? <p className="campaign-management__description"><strong>Your comments:</strong> {comments.trim()}</p> : null}
                    <div className="campaign-management__actions">
                      <button type="button" disabled={saving} onClick={saveDecision}>{saving ? 'Saving review…' : decision === 'approved' ? 'Confirm approval' : 'Confirm rejection'}</button>
                      <button type="button" disabled={saving} className="campaign-management__secondary" onClick={() => setConfirming(false)}>Cancel</button>
                    </div>
                    {saving ? <p role="status">Saving your review…</p> : null}
                  </div>
                ) : null}
              </form>
            )}
            <section className="admin-content-actions" aria-labelledby="admin-content-actions-title">
              <h3 id="admin-content-actions-title">Manage campaign</h3>
              {campaign.status !== 'pending' && saveError ? <p className="campaign-management__error" role="alert">{saveError}</p> : null}
              {campaign.status !== 'pending' && reloadRequired ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Reload campaign status</button> : null}
              <div className="campaign-management__actions">
                {campaign.status === 'approved' ? <button type="button" disabled={saving || reloadRequired || confirming} onClick={() => { setContentAction('unpublish'); setActionReason(''); setActionError('') }}>Remove from public view</button> : null}
                <button type="button" className="admin-danger-button" disabled={saving || reloadRequired || confirming} onClick={() => { setContentAction('delete'); setActionReason(''); setActionError('') }}>Delete campaign</button>
              </div>
              <p className="campaign-management__meta">Deletion removes the campaign from the application. Audit records are retained.</p>
            </section>
          </aside>
        </div>
      ) : null}
      {contentAction && campaign ? <AdminActionDialog title={contentAction === 'delete' ? 'Delete this campaign?' : 'Remove this campaign from public view?'}
        confirmLabel={contentAction === 'delete' ? 'Confirm deletion' : 'Confirm removal'} busy={saving}
        onCancel={() => setContentAction(null)} onConfirm={saveContentAction}>
        <p><strong>{campaign.title}</strong> · Campaign #{campaign.id}</p>
        <p>{contentAction === 'delete' ? 'The campaign will disappear from public, owner and campaign-management pages. Related records will be retained for audit and backend recovery.' : 'The campaign and its image will no longer be publicly available. It will return to pending review and can be published again after approval.'}</p>
        <label htmlFor="campaign-action-reason">Reason (required)</label>
        <textarea id="campaign-action-reason" value={actionReason} maxLength={2000} rows={4} disabled={saving} aria-invalid={Boolean(actionError)} aria-describedby={actionError ? 'campaign-action-error' : undefined}
          onChange={(event) => { setActionReason(event.target.value); setActionError('') }} />
        {actionError ? <p id="campaign-action-error" className="campaign-management__error" role="alert">{actionError}</p> : null}
      </AdminActionDialog> : null}
    </section>
  )
}
