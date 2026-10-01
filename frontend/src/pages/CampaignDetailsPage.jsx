import { useCallback } from 'react'
import { getCampaignById } from '../services/campaignService.js'
import useLiveRefresh from '../hooks/useLiveRefresh.js'
import CampaignParticipation from '../components/CampaignParticipation.jsx'
import CampaignEnquiryForm from '../components/CampaignEnquiryForm.jsx'

const isUnavailable = (error) => error?.code === 'NOT_FOUND' || error?.status === 404

const categoryClassNames = {
  Community: 'campaign-details--community',
  Education: 'campaign-details--education',
  Environment: 'campaign-details--environment',
}

function hideBrokenImage(event) {
  if (event.currentTarget.dataset.fallback) event.currentTarget.hidden = true
  else {
    event.currentTarget.dataset.fallback = 'true'
    event.currentTarget.src = '/campaign-placeholder.svg'
  }
}

function formatCampaignType(type) {
  if (type === 'business') return 'Small business'
  if (type === 'cause') return 'Social cause'
  return null
}

function businessWebsite(value) {
  if (typeof value !== 'string') return null
  const address = value.trim()
  if (!/^https?:\/\//i.test(address) || /[\\\x00-\x20\x7f]/.test(address)) return null
  try {
    const url = new URL(address)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function formatPublishedDate(createdAt) {
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) return 'Not provided'

  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(createdAt))
}

export default function CampaignDetailsPage({
  campaignId,
  token,
  role,
  campaignLoader = getCampaignById,
}) {
  const loadCampaign = useCallback(({ signal }) => campaignLoader(campaignId, { signal }), [campaignId, campaignLoader])
  const live = useLiveRefresh(loadCampaign, { resourceKey: String(campaignId), isUnavailable })
  const campaign = live.data?.campaign

  if (live.isLoading) {
    return (
      <section className="details-state content-width" aria-live="polite">
        <p>{live.paused === 'offline' ? 'You’re offline. Connect to the internet to load this campaign.' : 'Loading campaign…'}</p>
      </section>
    )
  }

  if (live.error && !campaign) {
    const isNotFound = isUnavailable(live.error)

    return (
      <section className="details-state content-width" aria-labelledby="details-error-title">
        <h1 id="details-error-title">
          {isNotFound ? 'Campaign not found' : 'Campaign could not be loaded'}
        </h1>
        <p>
          {isNotFound
            ? 'This campaign is unavailable or may have been removed.'
            : 'Please try again.'}
        </p>
        {isNotFound ? null : (
          <button type="button" onClick={live.refresh}>
            Try again
          </button>
        )}
        <a className="text-link" href="/#campaigns">Back to campaigns</a>
      </section>
    )
  }

  const categoryClassName = categoryClassNames[campaign.category] ?? 'campaign-details--default'
  const hasGoals = campaign.goals?.length > 0
  const hasAboutContent = Boolean(campaign.details || hasGoals)
  const website = businessWebsite(campaign.business?.website)

  return (
    <section className="campaign-details-page content-width" aria-labelledby="campaign-title">
      <a className="back-link" href="/#campaigns" aria-label="Back to campaigns">
        ← Back to campaigns
      </a>

      <div className="public-campaign-filter-notice">
        {live.updatedAt ? <p>Last updated <time dateTime={live.updatedAt.toISOString()}>{live.updatedAt.toLocaleTimeString('en-AU')}</time>. Updates automatically while this page is open.</p> : null}
        <button type="button" onClick={live.refresh} disabled={live.refreshing || live.paused === 'offline'}>Refresh campaign</button>
        {live.refreshing ? <p role="status">Checking for campaign updates…</p> : null}
        {live.paused === 'offline' ? <p role="status">You’re offline. Campaign updates will resume when you reconnect.</p> : null}
        {live.error ? <p role="alert">Campaign updates could not be loaded. Showing the last loaded campaign. <button type="button" onClick={live.refresh}>Retry updates</button></p> : null}
      </div>

      <article className={`campaign-details ${categoryClassName}`}>
        <div className="campaign-details__media">
          <img
            key={`${campaign.id}:${campaign.imageUrl || ''}`}
            src={campaign.imageUrl || '/campaign-placeholder.svg'}
            alt=""
            decoding="async"
            onError={hideBrokenImage}
          />
        </div>
        <div className="campaign-details__body">
          <p className="campaign-details__category">{campaign.category}</p>
          <h1 id="campaign-title">{campaign.title}</h1>
          <p>{campaign.description}</p>
        </div>
      </article>

      <div className="campaign-details__more">
        {hasAboutContent ? (
          <section className="details-panel" aria-labelledby="about-campaign-title">
            <h2 id="about-campaign-title">About this campaign</h2>
            {campaign.details ? <p>{campaign.details}</p> : null}

            {hasGoals ? (
              <>
                <h2>Campaign goals</h2>
                <ul className="campaign-goals">
                  {campaign.goals.map((goal) => <li key={goal}>{goal}</li>)}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        <aside className="details-panel campaign-information" aria-labelledby="campaign-information-title">
          <h2 id="campaign-information-title">Campaign information</h2>
          <dl>
            <div>
              <dt>Category</dt>
              <dd>{campaign.category ?? 'Not specified'}</dd>
            </div>
            {formatCampaignType(campaign.type) ? <div>
              <dt>Campaign type</dt>
              <dd>{formatCampaignType(campaign.type)}</dd>
            </div> : null}
            {campaign.business?.businessName ? <div>
              <dt>Business</dt>
              <dd>{campaign.business.businessName}</dd>
            </div> : null}
            {website ? <div>
              <dt>Website</dt>
              <dd><a className="text-link" href={website}>Visit business website</a></dd>
            </div> : null}
            {campaign.startDate ? <div>
              <dt>Starts</dt>
              <dd>{formatPublishedDate(campaign.startDate)}</dd>
            </div> : null}
            {campaign.endDate ? <div>
              <dt>Ends</dt>
              <dd>{formatPublishedDate(campaign.endDate)}</dd>
            </div> : null}
            {campaign.targetAudience ? <div>
              <dt>Who can take part</dt>
              <dd>{campaign.targetAudience}</dd>
            </div> : null}
            <div>
              <dt>Created</dt>
              <dd>{formatPublishedDate(campaign.createdAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>
      {campaign.type === 'cause' ? <CampaignParticipation key={campaign.id} campaign={campaign} token={token} role={role} /> : null}
      {campaign.type === 'business' ? <CampaignEnquiryForm key={campaign.id} campaign={campaign} token={token} role={role} /> : null}
    </section>
  )
}
