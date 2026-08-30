
import { useEffect } from 'react'

export default function LogoutPage() {
  useEffect(() => {
    localStorage.removeItem('isLoggedIn')
  }, [])

  function handleReturnHome() {
    window.location.href = '/'
  }

  return (
    <section
      className="auth-page content-width"
      aria-labelledby="logout-title"
    >
      <div className="auth-card">
        <h1 id="logout-title">Logout</h1>

        <div className="logout-image-box">
          <img
            src="/images/Logout/logout_logo.png"
            alt="Logout successful"
          />
        </div>

        <p className="logout-message">
          You have logged out
        </p>

        <button
          className="logout-home-button"
          type="button"
          onClick={handleReturnHome}
        >
          Return to home page
        </button>
      </div>
    </section>
  )
}
