import { lazy, Suspense } from 'react'
import HomePage from './pages/HomePage.jsx'
import CampaignDetailsPage from './pages/CampaignDetailsPage.jsx'
import RegistrationPage from './pages/RegistrationPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import LogoutPage from './pages/LogoutPage.jsx'
import CreateCampaignPage from './pages/CreateCampaignPage.jsx'
const CreateCampaignDraft = import.meta.env.DEV
  ? lazy(() => import('./pages/CreateCampaignDraftPage.jsx'))
  : null

function getRoute(pathname) {
  if (pathname === '/campaigns/new' || pathname === '/campaigns/new/') {
    return { name: 'create-campaign' }
  }

  if (import.meta.env.DEV && pathname === '/draft/campaigns/new') {
    return { name: 'campaign-draft' }
  }

  const campaignMatch = pathname.match(/^\/campaigns\/([^/]+)\/?$/)

  if (campaignMatch) {
    return {
      name: 'campaign-details',
      campaignId: decodeURIComponent(campaignMatch[1]),
    }
  }

  if (pathname === '/') {
    return { name: 'home' }
  }

  if (pathname === '/register') {
    return { name: 'register' }
  }
  if (pathname === '/login') {
    return { name: 'login' }
  }
  if (pathname === '/logout') {
    return { name: 'logout' }
  }
  return { name: 'not-found' }
}

export default function App({ pathname = window.location.pathname }) {
  const route = getRoute(pathname)
  const isLoggedIn = Boolean(localStorage.getItem('token'))

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <header className="site-header">
        <div className="site-header__inner">
          <a className="site-name" href="/" aria-label="CauseConnect home">
            CauseConnect
          </a>
          <nav aria-label="Primary navigation">
            <a href="/" aria-current={route.name === 'home' ? 'page' : undefined}>
              Home
            </a>

            <a href="/#campaigns">Campaigns</a>

            {isLoggedIn ? (
              <>
                <a href="/campaigns/new" aria-current={route.name === 'create-campaign' ? 'page' : undefined}>Create campaign</a>
                <a href="/logout">Logout</a>
              </>
            ) : (
              <a href="/login">Login</a>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content">
        {route.name === 'home' ? <HomePage /> : null}
        {route.name === 'campaign-details' ? (
          <CampaignDetailsPage campaignId={route.campaignId} />
        ) : null}
        {route.name === 'register' ? <RegistrationPage /> : null}
        {route.name === 'login' ? <LoginPage /> : null}
        {route.name === 'logout' ? <LogoutPage /> : null}
        {route.name === 'create-campaign' ? <CreateCampaignPage /> : null}
        {route.name === 'campaign-draft' && CreateCampaignDraft ? (
          <Suspense fallback={<p className="content-width">Loading frontend draft…</p>}>
            <CreateCampaignDraft />
          </Suspense>
        ) : null}
        {route.name === 'not-found' ? (
          <section className="not-found-page content-width" aria-labelledby="not-found-title">
            <h1 id="not-found-title">Page not found</h1>
            <p>The page you requested is not available.</p>
            <a className="text-link" href="/">Return to the homepage</a>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <p className="site-footer__name">CauseConnect</p>
          <p>Raise awareness. Create change.</p>
        </div>
      </footer>
    </div>
  )
}
