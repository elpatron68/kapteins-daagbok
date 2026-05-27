import { useState, useEffect } from 'react'
import './App.css'
import AuthOnboarding from './components/AuthOnboarding.tsx'
import { getActiveMasterKey, logoutUser } from './services/auth.js'
import { Anchor, LogOut, ShieldCheck, Database } from 'lucide-react'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const savedUser = localStorage.getItem('active_username')
    const key = getActiveMasterKey()
    if (savedUser && key) {
      setIsAuthenticated(true)
      setUsername(savedUser)
    }
  }, [])

  const handleAuthenticated = () => {
    setIsAuthenticated(true)
    setUsername(localStorage.getItem('active_username'))
  }

  const handleLogout = () => {
    logoutUser()
    setIsAuthenticated(false)
    setUsername(null)
  }

  if (!isAuthenticated) {
    return <AuthOnboarding onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="dashboard-mock">
      <div className="auth-brand">
        <Anchor className="auth-icon accent" size={60} style={{ color: '#fbbf24' }} />
        <h2>Kapteins Daagbox</h2>
        <p className="tagline" style={{ color: '#34d399' }}>
          <ShieldCheck size={16} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
          Session Decrypted (Zero-Knowledge)
        </p>
      </div>

      <div style={{ textAlign: 'left', margin: '30px 0', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 20, background: 'rgba(255,255,255,0.02)' }}>
        <p style={{ color: '#e2e8f0', margin: '0 0 10px 0' }}><strong>Skipper:</strong> {username}</p>
        <p style={{ color: '#e2e8f0', margin: '0 0 10px 0' }}><strong>Status:</strong> E2E Secure Connection Active</p>
        <p style={{ color: '#94a3b8', margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
          <Database size={15} />
          Local IndexedDB synced with zero-knowledge PostgreSQL server payload
        </p>
      </div>

      <button className="btn secondary" onClick={handleLogout}>
        <LogOut size={18} />
        Abmelden (Logout)
      </button>
    </div>
  )
}

export default App
