import { useEffect, useId, useRef, useState } from 'react'
import { authPagePath } from '../services/authSession.js'

export default function SiteNavigation({ token, role, route, createPath }) {
  const [open, setOpen] = useState(false)
  const account = useRef(null)
  const toggle = useRef(null)
  const panelId = useId()
  const owner = role === 'public' || role === 'business_owner'
  const returnTo = ['login', 'register'].includes(route.name) ? new URLSearchParams(window.location.search).get('returnTo') : null
  const accountLinks = [
    ...(owner ? [
      { href: '/my-campaigns', label: 'My campaigns', routes: ['my-campaigns', 'edit-campaign'] },
      { href: '/my-participation', label: 'My participation', routes: ['my-participation'] },
    ] : []),
    ...(role === 'business_owner' ? [
      { href: '/business/profile', label: 'Business profile', routes: ['business-profile'] },
      { href: '/business/enquiries', label: 'Enquiries', routes: ['business-enquiries'] },
    ] : []),
    ...(role === 'admin' ? [{ href: '/admin/users', label: 'Manage users', routes: ['admin-users'] }] : []),
    { href: '/logout', label: 'Logout', routes: ['logout'] },
  ]
  const accountActive = accountLinks.some(link => link.routes.includes(route.name))

  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => {
      if (!account.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  return <nav className="site-navigation" aria-label="Primary navigation">
    <a href="/" aria-current={route.name === 'home' ? 'page' : undefined}>Home</a>
    <a href="/#campaigns">Campaigns</a>
    {token && owner ? <a className="site-navigation__action" href={createPath} aria-current={['create-campaign', 'business-campaign'].includes(route.name) ? 'page' : undefined}>Create campaign</a> : null}
    {token && role === 'admin' ? <a className="site-navigation__action" href="/admin/campaigns" aria-current={['admin-campaigns', 'admin-review'].includes(route.name) ? 'page' : undefined}>Review campaigns</a> : null}
    {token ? <div className="account-navigation" ref={account} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }} onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
        toggle.current?.focus()
      }
    }}>
      <button type="button" ref={toggle} className={`account-navigation__toggle${accountActive ? ' account-navigation__toggle--active' : ''}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
        Account <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open ? <div id={panelId} className="account-navigation__panel">
        <p>{role === 'admin' ? 'Admin account' : role === 'business_owner' ? 'Business account' : 'Your account'}</p>
        {accountLinks.map(link => <a key={link.href} href={link.href} aria-current={link.routes.includes(route.name) ? 'page' : undefined}>{link.label}</a>)}
      </div> : null}
    </div> : <>
      <a href={authPagePath('/login', returnTo)} aria-current={route.name === 'login' ? 'page' : undefined}>Login</a>
      <a className="site-navigation__action" href={authPagePath('/register', returnTo)} aria-current={route.name === 'register' ? 'page' : undefined}>Register</a>
    </>}
  </nav>
}
