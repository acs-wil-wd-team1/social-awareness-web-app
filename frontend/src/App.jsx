import HomePage from './pages/HomePage.jsx'
import CampaignDetailsPage from './pages/CampaignDetailsPage.jsx'
import RegistrationPage from './pages/RegistrationPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import LogoutPage from './pages/LogoutPage.jsx'

function getRoute(pathname) {
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
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'


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
    <a href="/logout">Logout</a>
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
