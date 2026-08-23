import HomePage from './pages/HomePage.jsx'

export default function App() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <header className="site-header">
        <div className="site-header__inner">
          <a className="site-name" href="/" aria-label="CauseConnect home">
            CauseConnect
          </a>
          <nav aria-label="Primary navigation">
            <a href="/" aria-current="page">Home</a>
            <a href="#campaigns">Campaigns</a>
            {/* Enable after the /login route is implemented: <a href="/login">Login</a> */}
          </nav>
        </div>
      </header>

      <main id="main-content">
        <HomePage />
      </main>
    </div>
  )
}
