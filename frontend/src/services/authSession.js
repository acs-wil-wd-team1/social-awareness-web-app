import { useEffect, useState } from 'react'

const changeEvent = 'causeconnect:session'
const dismissNoticeEvent = 'causeconnect:session-notice-dismissed'
const roles = ['public', 'business_owner', 'admin']
export const SESSION_STORAGE_FAILURE_MESSAGE = 'Your browser could not save the login. Allow site storage and try again.'
export const SESSION_STORAGE_FAILURE_CODE = 'SESSION_STORAGE_UNAVAILABLE'

function claimsFor(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return {} }
}

export function getSession() {
  try {
    const token = localStorage.getItem('token')
    if (!token) return { token: null, user: null }
    const claims = claimsFor(token)
    if (typeof claims.exp === 'number' && claims.exp * 1000 <= Date.now()) return { token: null, user: null }
    let user = null
    try { user = JSON.parse(localStorage.getItem('causeconnect.user') || 'null') } catch { /* Older sessions only saved a token. */ }
    const role = roles.includes(claims.role) ? claims.role : user?.role
    return { token, user: { id: claims.id ?? user?.id, name: user?.name || '', role: roles.includes(role) ? role : null } }
  } catch { return { token: null, user: null } }
}

export function storeSession(token, user) {
  try {
    localStorage.setItem('token', token)
    if (user) localStorage.setItem('causeconnect.user', JSON.stringify({ id: user.id, name: user.name, role: user.role }))
    else localStorage.removeItem('causeconnect.user')
  } catch {
    // Never leave a new token paired with the previous account's saved details.
    clearSession('storage-failure')
    const failure = new Error(SESSION_STORAGE_FAILURE_MESSAGE)
    failure.code = SESSION_STORAGE_FAILURE_CODE
    throw failure
  }
  window.dispatchEvent(new Event(changeEvent))
}

export function clearSession(reason) {
  for (const key of ['token', 'causeconnect.user', 'isLoggedIn']) {
    try { localStorage.removeItem(key) } catch { /* Storage may have become blocked since login. */ }
  }
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: { reason } }))
}

export function dismissSessionStorageFailure() {
  // This notice is local to the initiating window; never save it or its cause.
  window.dispatchEvent(new Event(dismissNoticeEvent))
}

export function useSession() {
  const [session, setSession] = useState(getSession)
  useEffect(() => {
    const update = (event) => {
      if (event?.type === dismissNoticeEvent) {
        setSession(previous => {
          const { storageFailure, ...remaining } = previous
          return remaining
        })
        return
      }
      const next = getSession()
      setSession(previous => {
        const expired = event?.detail?.reason === 'expired'
          || (!event && previous.token && !next.token && typeof claimsFor(previous.token).exp === 'number' && claimsFor(previous.token).exp * 1000 <= Date.now())
          || (!event && previous.sessionExpired)
        const storageFailure = event?.detail?.reason === 'storage-failure'
          || ((!event || event.type === 'storage') && previous.storageFailure && next.token === previous.token)
        return { ...next,
          ...(!next.token && expired ? { sessionExpired: true } : {}),
          ...(!next.token && storageFailure ? { storageFailure: true } : {}),
        }
      })
    }
    const unauthorized = (event) => {
      if (event.detail?.token && event.detail.token === getSession().token) clearSession('expired')
    }
    window.addEventListener(changeEvent, update)
    window.addEventListener(dismissNoticeEvent, update)
    window.addEventListener('storage', update)
    window.addEventListener('causeconnect:unauthorized', unauthorized)
    // A child effect can sign out before this subscription is installed.
    update()
    const interval = setInterval(update, 30000)
    return () => {
      window.removeEventListener(changeEvent, update)
      window.removeEventListener(dismissNoticeEvent, update)
      window.removeEventListener('storage', update)
      window.removeEventListener('causeconnect:unauthorized', unauthorized)
      clearInterval(interval)
    }
  }, [])
  return session
}

export function safeReturnPath(value) {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) && !/[\\\x00-\x20\x7f]/.test(value) ? value : '/'
}

export function authPagePath(page, returnTo) {
  const destination = safeReturnPath(returnTo)
  return `${page}${destination === '/' ? '' : `?returnTo=${encodeURIComponent(destination)}`}`
}
