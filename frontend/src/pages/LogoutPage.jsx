import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../services/apiClient.js'
import { clearSession, getSession } from '../services/authSession.js'

export default function LogoutPage() {
  // Retain the token only in this mounted page so a failed revocation can be retried.
  const token = useRef(getSession().token)
  const request = useRef(null)
  const mounted = useRef(false)
  const [status, setStatus] = useState(token.current ? 'pending' : 'done')

  const endServerSession = useCallback(() => {
    if (!token.current) return Promise.resolve('done')
    if (!request.current) {
      request.current = apiRequest('/api/auth/logout', { method: 'PUT', token: token.current })
        .then(() => {
          token.current = null
          return 'done'
        }, (error) => {
          // A rejected/expired session cannot be used again, so logout is complete.
          if (error.status === 401) {
            token.current = null
            return 'done'
          }
          return 'unconfirmed'
        })
        .finally(() => { request.current = null })
    }
    return request.current
  }, [])

  useEffect(() => {
    let active = true
    mounted.current = true
    clearSession()
    // Reuse the in-flight request when StrictMode repeats effect setup.
    endServerSession().then((result) => { if (active) setStatus(result) })
    return () => { active = false; mounted.current = false }
  }, [endServerSession])

  function retryLogout() {
    setStatus('pending')
    endServerSession().then((result) => { if (mounted.current) setStatus(result) })
  }

  return (
    <section
      className="auth-page content-width"
      aria-labelledby="logout-title"
    >
      <div className="auth-card">
        <h1 id="logout-title">Logout</h1>

        {status === 'pending' && <p className="auth-form__status" role="status">You’re signed out in this browser. Ending your server session…</p>}
        {status === 'done' && <p className="auth-form__status" role="status">You’re logged out.</p>}
        {status === 'unconfirmed' && <div className="auth-form">
          <p className="auth-field__error" role="alert">You’re signed out in this browser, but we couldn’t confirm that your server session ended. Please retry to confirm logout.</p>
          <button className="auth-button" type="button" onClick={retryLogout}>Retry logout</button>
        </div>}
        <p className="auth-switch"><a href="/">Return to home page</a></p>
      </div>
    </section>
  )
}
