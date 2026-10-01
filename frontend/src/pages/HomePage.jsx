import { useCallback, useEffect, useState } from 'react'
import CampaignCard from '../components/CampaignCard.jsx'
import { listCampaigns, loadPublicCategories } from '../services/campaignService.js'
import useLiveRefresh from '../hooks/useLiveRefresh.js'
import '../styles/public-browsing.css'

const emptyResult = { items: [], page: 1, pageSize: 20, total: 0 }

export default function HomePage({ campaignLoader = listCampaigns, categoryLoader = loadPublicCategories, token, role }) {
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState([])
  const [categoryState, setCategoryState] = useState('loading')
  const [categoryRetry, setCategoryRetry] = useState(0)
  const startPath = role === 'business_owner' ? '/business/campaigns/new' : '/campaigns/new'

  useEffect(() => {
    const controller = new AbortController()
    setCategoryState('loading')
    categoryLoader({ signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return
      setCategories(response)
      setCategoryState('success')
    }).catch(() => {
      if (!controller.signal.aborted) setCategoryState('error')
    })
    return () => controller.abort()
  }, [categoryLoader, categoryRetry])

  const loadCampaigns = useCallback(({ signal }) => campaignLoader({ signal, page, pageSize: 20, search, category }),
    [campaignLoader, page, search, category])
  const live = useLiveRefresh(loadCampaigns, { resourceKey: JSON.stringify([page, search, category]) })
  const result = live.data ?? emptyResult
  const isLoading = live.isLoading
  const hasError = Boolean(live.error && !live.data)
  const hasNext = result.hasNext ?? (typeof result.total === 'number'
    ? result.page * result.pageSize < result.total : result.items.length === result.pageSize)

  return (
    <section className="homepage" aria-labelledby="page-title">
      <header className="page-intro content-width">
        <h1 id="page-title" aria-label="Raise awareness. Create change.">
          <span>Raise awareness.</span>
          <span>Create change.</span>
        </h1>
        <p className="page-intro__description">Find community causes and local business initiatives. Get involved in a campaign, or share one of your own.</p>
        <div className="page-intro__actions">
          <a className="page-intro__primary" href="#campaigns">Explore campaigns</a>
          {token && role === 'admin' ? <a className="text-link" href="/admin/campaigns">Review campaigns <span aria-hidden="true">→</span></a>
            : token && ['public', 'business_owner'].includes(role) ? <a className="text-link" href={startPath}>Start a campaign <span aria-hidden="true">→</span></a>
              : !token ? <a className="text-link" href="/register">Create an account <span aria-hidden="true">→</span></a> : null}
        </div>
      </header>

      <section className="campaign-section" id="campaigns" aria-labelledby="campaigns-title">
        <div className="content-width">
          <div className="campaign-section__heading">
            <h2 id="campaigns-title">Current campaigns</h2>
            <p>Find something you care about.</p>
          </div>
          <form className="public-campaign-filters" onSubmit={(event) => {
            event.preventDefault()
            setSearch(searchInput.trim())
            setPage(1)
          }}>
            <div>
              <label htmlFor="public-campaign-search">Find a campaign</label>
              <input id="public-campaign-search" type="search" placeholder="Search by title" maxLength={200}
                value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
            </div>
            <div>
              <label htmlFor="public-campaign-category">Category</label>
              <select id="public-campaign-category" value={category} disabled={categoryState !== 'success'} onChange={(event) => {
                setCategory(event.target.value)
                setPage(1)
              }}>
                <option value="">{categoryState === 'loading' ? 'Loading categories…' : 'All categories'}</option>
                {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <button type="submit">Search</button>
            {search || category ? <button type="button" className="public-campaign-filters__clear" onClick={() => {
              setSearchInput(''); setSearch(''); setCategory(''); setPage(1)
            }}>Clear filters</button> : null}
          </form>
          {categoryState === 'error' ? <p className="public-campaign-filter-notice">Categories could not be loaded. You can still browse or search. <button type="button" onClick={() => setCategoryRetry((value) => value + 1)}>Retry categories</button></p> : null}
          <div className="public-campaign-filter-notice public-campaign-updates">
            <div className="public-campaign-updates__summary">
              {live.updatedAt ? <p>Last updated <time dateTime={live.updatedAt.toISOString()}>{live.updatedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</time><span className="visually-hidden">. Updates automatically while this page is open.</span></p> : null}
              {live.data ? <button type="button" onClick={live.refresh} disabled={live.refreshing || live.paused === 'offline'}>Refresh campaigns</button> : null}
            </div>
            {live.refreshing && live.data ? <p role="status">Checking for campaign updates…</p> : null}
            {live.paused === 'offline' ? <p role="status">You’re offline. Campaign updates will resume when you reconnect.</p> : null}
            {live.error && live.data ? <p role="alert">Campaign updates could not be loaded. Showing the last loaded campaigns. <button type="button" onClick={live.refresh}>Retry updates</button></p> : null}
          </div>
          {!isLoading && !hasError ? (
            <p className="visually-hidden" role="status">
              {result.items.length} campaign{result.items.length === 1 ? '' : 's'} on page {result.page}
            </p>
          ) : null}

          {hasError ? (
            <div className="campaign-state campaign-state--error" role="alert">
              <h3>Campaigns could not be loaded</h3>
              <p>Please try again.</p>
              <button type="button" onClick={live.refresh}>Try again</button>
            </div>
          ) : (
            <ul className="campaign-grid" aria-busy={isLoading} aria-label="Campaigns">
              {result.items.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}

              {isLoading ? (
                <li className="campaign-state" role="status">
                  <p>{live.paused === 'offline' ? 'Connect to the internet to load campaigns.' : 'Loading campaigns…'}</p>
                </li>
              ) : null}

              {!isLoading && result.items.length === 0 ? (
                <li className="campaign-state">
                  <h3>{search || category ? 'No matching campaigns' : page > 1 ? 'No more campaigns on this page' : 'No campaigns are available yet'}</h3>
                  <p>{search || category ? 'Try another search or clear the filters.' : page > 1 ? 'Use Previous to return to the last page.' : 'Please check again later.'}</p>
                </li>
              ) : null}
            </ul>
          )}
          <nav className="public-campaign-pagination" aria-label="Public campaign pages">
            <button type="button" disabled={isLoading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <span>Page {page}</span>
            <button type="button" disabled={isLoading || hasError || !hasNext} onClick={() => setPage((value) => value + 1)}>Next</button>
          </nav>
        </div>
      </section>
    </section>
  )
}
