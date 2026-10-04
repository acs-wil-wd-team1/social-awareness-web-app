import { lazy, Suspense } from 'react'
import HomePage from './pages/HomePage.jsx'
import CampaignDetailsPage from './pages/CampaignDetailsPage.jsx'
import RegistrationPage from './pages/RegistrationPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import LogoutPage from './pages/LogoutPage.jsx'
import CreateCampaignPage from './pages/CreateCampaignPage.jsx'
import BusinessProfilePage from './pages/BusinessProfilePage.jsx'
import MyCampaignsPage from './pages/MyCampaignsPage.jsx'
import AdminCampaignsPage from './pages/AdminCampaignsPage.jsx'
import AdminCampaignReviewPage from './pages/AdminCampaignReviewPage.jsx'
import EditCampaignPage from './pages/EditCampaignPage.jsx'
import MyParticipationPage from './pages/MyParticipationPage.jsx'
import BusinessEnquiriesPage from './pages/BusinessEnquiriesPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'
import SiteNavigation from './components/SiteNavigation.jsx'
import { authPagePath, useSession } from './services/authSession.js'
import './styles/stage3-shell.css'

const DemoBanner = import.meta.env.VITE_DEMO_MODE === 'true' ? lazy(() => import('./demo/DemoBanner.jsx')) : null
const hasTeamLogo = Object.keys(import.meta.glob('/public/images/brand/causeconnect-logo.png', { eager: true, query: '?url', import: 'default' })).length > 0
const CreateCampaignDraft = import.meta.env.DEV ? lazy(() => import('./pages/CreateCampaignDraftPage.jsx')) : null

export function getRoute(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const routes = { '/': 'home', '/login': 'login', '/register': 'register', '/logout': 'logout',
    '/campaigns/new': 'create-campaign', '/business/campaigns/new': 'business-campaign',
    '/business/profile': 'business-profile', '/my-campaigns': 'my-campaigns', '/admin/campaigns': 'admin-campaigns',
    '/my-participation': 'my-participation', '/business/enquiries': 'business-enquiries', '/admin/users': 'admin-users' }
  if (routes[path]) return { name: routes[path] }
  if (import.meta.env.DEV && path === '/draft/campaigns/new') return { name: 'campaign-draft' }
  const admin = path.match(/^\/admin\/campaigns\/(\d+)$/)
  if (admin) return { name: 'admin-review', campaignId: admin[1] }
  const edit = path.match(/^\/my-campaigns\/(\d+)\/edit$/)
  if (edit) return { name: 'edit-campaign', campaignId: edit[1] }
  const campaign = path.match(/^\/campaigns\/(\d+)$/)
  if (campaign) return { name: 'campaign-details', campaignId: campaign[1] }
  return { name: 'not-found' }
}

export default function App({ pathname = window.location.pathname }) {
  const route = getRoute(pathname)
  const { token, user, sessionExpired } = useSession()
  const role = user?.role
  const sessionProps = { token, role }
  const createPath = role === 'business_owner' ? '/business/campaigns/new' : '/campaigns/new'
  return <div className="site-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    {DemoBanner ? <Suspense fallback={<aside className="preview-banner"><strong>Frontend preview · sample data</strong></aside>}><DemoBanner /></Suspense> : null}
    <header className="site-header">
      <div className="site-header__inner">
        <a className="site-name" href="/" aria-label="CauseConnect home">
          {hasTeamLogo ? <img className="site-logo" src="/images/brand/causeconnect-logo.png" alt="CauseConnect — Connect people. Create change." /> : 'CauseConnect'}
        </a>
        <SiteNavigation key={`${token || 'guest'}:${role}:${route.name}`} {...sessionProps} route={route} createPath={createPath} />
      </div>
    </header>
    {/* Logout must retain its in-memory revocation token after clearing browser storage. */}
    <main id="main-content" key={route.name === 'logout' ? 'logout' : token || 'guest'}>
      {sessionExpired && route.name !== 'logout' ? <div className="content-width campaign-profile-state" role="alert">
        <p>Your session has expired. Please log in again.</p>
        {['create-campaign', 'business-campaign', 'business-profile', 'edit-campaign'].includes(route.name) ? <p>Unsaved changes were cleared for security. If you were saving, check your saved records before trying again.</p> : null}
        <a className="text-link" href={authPagePath('/login', pathname + (pathname === window.location.pathname ? window.location.search + window.location.hash : ''))}>Sign in again</a>
      </div> : null}
      {route.name === 'home' ? <HomePage {...sessionProps} /> : null}
      {route.name === 'campaign-details' ? <CampaignDetailsPage {...sessionProps} campaignId={route.campaignId} /> : null}
      {route.name === 'register' ? <RegistrationPage /> : null}
      {route.name === 'login' ? <LoginPage /> : null}
      {route.name === 'logout' ? <LogoutPage /> : null}
      {route.name === 'create-campaign' ? <CreateCampaignPage {...sessionProps} /> : null}
      {route.name === 'business-campaign' ? <CreateCampaignPage {...sessionProps} mode="business" /> : null}
      {route.name === 'business-profile' ? <BusinessProfilePage {...sessionProps} /> : null}
      {route.name === 'my-campaigns' ? <MyCampaignsPage {...sessionProps} /> : null}
      {route.name === 'edit-campaign' ? <EditCampaignPage {...sessionProps} campaignId={route.campaignId} /> : null}
      {route.name === 'my-participation' ? <MyParticipationPage {...sessionProps} /> : null}
      {route.name === 'business-enquiries' ? <BusinessEnquiriesPage {...sessionProps} /> : null}
      {route.name === 'admin-users' ? <AdminUsersPage {...sessionProps} currentUserId={user?.id} /> : null}
      {route.name === 'admin-campaigns' ? <AdminCampaignsPage {...sessionProps} /> : null}
      {route.name === 'admin-review' ? <AdminCampaignReviewPage {...sessionProps} campaignId={route.campaignId} /> : null}
      {route.name === 'campaign-draft' && CreateCampaignDraft ? <Suspense fallback={<p className="content-width">Loading frontend draft…</p>}><CreateCampaignDraft /></Suspense> : null}
      {route.name === 'not-found' ? <section className="not-found-page content-width" aria-labelledby="not-found-title">
        <h1 id="not-found-title">Page not found</h1><p>The page you requested is not available.</p><a className="text-link" href="/">Return to the homepage</a>
      </section> : null}
    </main>
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <p className="site-footer__name">CauseConnect</p>
          <p>Raise awareness. Create change.</p>
        </div>
        <nav className="site-footer__links" aria-label="Footer navigation">
          <a href="/">Home</a>
          <a href="/#campaigns">Campaigns</a>
        </nav>
        <p className="site-footer__copyright">© 2026 CauseConnect</p>
      </div>
    </footer>
  </div>
}
