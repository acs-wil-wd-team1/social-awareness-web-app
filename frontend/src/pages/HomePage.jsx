import { useEffect, useState } from 'react'
import CampaignCard from '../components/CampaignCard.jsx'
import { listCampaigns } from '../services/campaignService.js'

const emptyResult = { items: [], page: 1, pageSize: 20, total: 0 }

export default function HomePage({ campaignLoader = listCampaigns }) {
  const [result, setResult] = useState(emptyResult)
  const [requestState, setRequestState] = useState('loading')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    setRequestState('loading')
    setResult(emptyResult)

    campaignLoader({ signal: controller.signal })
      .then((nextResult) => {
        if (!controller.signal.aborted) {
          setResult(nextResult)
          setRequestState('success')
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.code !== 'ABORTED') {
          setRequestState('error')
        }
      })

    return () => controller.abort()
  }, [campaignLoader, retryKey])

  const isLoading = requestState === 'loading'
  const hasError = requestState === 'error'

  return (
    <section className="homepage" aria-labelledby="page-title">
      <header className="page-intro content-width">
        <h1 id="page-title" aria-label="Raise awareness. Create change.">
          <span>Raise awareness.</span>
          <span>Create change.</span>
        </h1>
      </header>

      <section className="campaign-section" id="campaigns" aria-labelledby="campaigns-title">
        <div className="content-width">
          <h2 className="visually-hidden" id="campaigns-title">Current campaigns</h2>
          {!isLoading && !hasError ? (
            <p className="visually-hidden" role="status">
              {result.total} campaign{result.total === 1 ? '' : 's'}
            </p>
          ) : null}

          {hasError ? (
            <div className="campaign-state campaign-state--error" role="alert">
              <h3>Campaigns could not be loaded</h3>
              <p>Please try again.</p>
              <button type="button" onClick={() => setRetryKey((current) => current + 1)}>Try again</button>
            </div>
          ) : (
            <ul className="campaign-grid" aria-busy={isLoading} aria-label="Campaigns">
              {result.items.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}

              {isLoading ? (
                <li className="campaign-state" role="status">
                  <p>Loading campaigns…</p>
                </li>
              ) : null}

              {!isLoading && result.items.length === 0 ? (
                <li className="campaign-state">
                  <h3>No campaigns are available yet</h3>
                  <p>Please check again later.</p>
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </section>
    </section>
  )
}
