const categoryClassNames = {
  Community: 'campaign-card--community',
  Education: 'campaign-card--education',
  Environment: 'campaign-card--environment',
}

function hideBrokenImage(event) {
  event.currentTarget.hidden = true
}

export default function CampaignCard({ campaign }) {
  const mediaClassName = categoryClassNames[campaign.category] ?? 'campaign-card--default'

  return (
    <li className={`campaign-card ${mediaClassName}`}>
      <article>
        <div className="campaign-card__media">
          <img
            src={campaign.imageUrl}
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
