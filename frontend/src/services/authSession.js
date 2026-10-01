import { useEffect, useState } from 'react'

const changeEvent = 'causeconnect:session'
const roles = ['public', 'business_owner', 'admin']

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
  localStorage.setItem('token', token)
  if (user) localStorage.setItem('causeconnect.user', JSON.stringify({ id: user.id, name: user.name, role: user.role }))
  else localStorage.removeItem('causeconnect.user')
  window.dispatchEvent(new Event(changeEvent))
}

export function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('causeconnect.user')
  localStorage.removeItem('isLoggedIn')
  window.dispatchEvent(new Event(changeEvent))
}

export function useSession() {
  const [session, setSession] = useState(getSession)
  useEffect(() => {
    const update = () => setSession(getSession())
    const unauthorized = (event) => {
      if (event.detail?.token === localStorage.getItem('token')) clearSession()
    }
    window.addEventListener(changeEvent, update)
    window.addEventListener('storage', update)
    window.addEventListener('causeconnect:unauthorized', unauthorized)
    const interval = setInterval(update, 30000)
    return () => {
      window.removeEventListener(changeEvent, update)
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
