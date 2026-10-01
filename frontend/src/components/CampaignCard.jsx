const categoryClassNames = {
  Community: 'campaign-card--community',
  Education: 'campaign-card--education',
  Environment: 'campaign-card--environment',
}

function hideBrokenImage(event) {
  if (event.currentTarget.dataset.fallback) event.currentTarget.hidden = true
  else {
    event.currentTarget.dataset.fallback = 'true'
    event.currentTarget.src = '/campaign-placeholder.svg'
  }
}

export default function CampaignCard({ campaign }) {
  const mediaClassName = categoryClassNames[campaign.category] ?? 'campaign-card--default'

  return (
    <li className={`campaign-card ${mediaClassName}`}>
      <article>
        <div className="campaign-card__media">
          <img
            key={`${campaign.id}:${campaign.imageUrl || ''}`}
            src={campaign.imageUrl || '/campaign-placeholder.svg'}
            alt=""
            loading="lazy"
            decoding="async"
            onError={hideBrokenImage}
          />
        </div>
        <div className="campaign-card__body">
          <p className="campaign-card__category">{campaign.category}</p>
          <h3>{campaign.title}</h3>
          <p className="campaign-card__description">{campaign.description}</p>
          <a
            className="campaign-card__link"
            href={`/campaigns/${encodeURIComponent(campaign.id)}`}
            aria-label={`View ${campaign.title}`}
          >
            View campaign
          </a>
        </div>
      </article>
    </li>
  )
}
