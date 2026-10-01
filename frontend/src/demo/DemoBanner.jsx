import { clearSession, storeSession, useSession } from '../services/authSession.js'
import { demoToken, demoUsers, resetDemo } from './demoApi.js'

export default function DemoBanner() {
  const { user } = useSession()
  function switchRole(role) {
    if (role === 'guest') clearSession()
    else storeSession(demoToken(role), demoUsers[role])
    window.location.assign('/')
  }
  return <aside className="preview-banner" aria-label="Frontend preview controls">
    <div><strong>Frontend preview · sample data</strong><p>No real accounts, uploads or approvals are saved to the server. This tab keeps sample changes until reset.</p></div>
    <label>Preview as <select value={user?.role || 'guest'} onChange={e => switchRole(e.target.value)}>
      <option value="guest">Guest</option><option value="public">Community member</option><option value="business_owner">Business owner</option><option value="admin">Admin</option>
    </select></label>
    <button type="button" onClick={() => { resetDemo(); window.location.reload() }}>Reset sample data</button>
  </aside>
}
