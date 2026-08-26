import { useEffect, useState } from 'react'
import { getCampaignById } from '../services/campaignService.js'

const categoryClassNames = {
  Community: 'campaign-details--community',
  Education: 'campaign-details--education',
  Environment: 'campaign-details--environment',
}

function hideBrokenImage(event) {
  event.currentTarget.hidden = true
}

function formatCampaignType(type) {
  if (type === 'business') return 'Small business'
  if (type === 'cause') return 'Social cause'
  return 'Not specified'
}

function formatPublishedDate(createdAt) {
  if (!createdAt) return 'Not specified'

  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(createdAt))
}

export default function CampaignDetailsPage({
  campaignId,
  campaignLoader = getCampaignById,
}) {
  const [campaign, setCampaign] = useState(null)
  const [requestState, setRequestState] = useState('loading')
  const [errorCode, setErrorCode] = useState(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    setCampaign(null)
    setErrorCode(null)
    setRequestState('loading')

    campaignLoader(campaignId, { signal: controller.signal })
      .then(({ campaign: nextCampaign }) => {
        if (!controller.signal.aborted) {
          setCampaign(nextCampaign)
          setRequestState('success')
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.code !== 'ABORTED') {
          setErrorCode(error?.code ?? 'UNKNOWN')
          setRequestState('error')
        }
      })

    return () => controller.abort()
  }, [campaignId, campaignLoader, retryKey])

  if (requestState === 'loading') {
    return (
      <section className="details-state content-width" aria-live="polite">
        <p>Loading campaign…</p>
      </section>
    )
  }

  if (requestState === 'error') {
    const isNotFound = errorCode === 'NOT_FOUND'

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
          <button type="button" onClick={() => setRetryKey((current) => current + 1)}>
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

  return (
    <section className="campaign-details-page content-width" aria-labelledby="campaign-title">
      <a className="back-link" href="/#campaigns" aria-label="Back to campaigns">
        ← Back to campaigns
      </a>

      <article className={`campaign-details ${categoryClassName}`}>
        <div className="campaign-details__media">
          <img
            src={campaign.imageUrl}
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
            <div>
              <dt>Campaign type</dt>
              <dd>{formatCampaignType(campaign.type)}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatPublishedDate(campaign.createdAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  )
}
