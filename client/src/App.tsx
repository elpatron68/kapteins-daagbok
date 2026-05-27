import { useState, useEffect } from 'react'
import './App.css'
import AuthOnboarding from './components/AuthOnboarding.tsx'
import LogbookDashboard from './components/LogbookDashboard.tsx'
import { getActiveMasterKey, logoutUser } from './services/auth.js'
import { startBackgroundSync, stopBackgroundSync, syncAllLogbooks } from './services/sync.js'
import { Ship, LogOut, ChevronLeft, Users, Compass, FileText, Settings, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function App() {
  const { t } = useTranslation()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeLogbookId, setActiveLogbookId] = useState<string | null>(null)
  const [activeLogbookTitle, setActiveLogbookTitle] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'vessel' | 'crew' | 'deviation' | 'logs' | 'settings'>('logs')
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      syncAllLogbooks()
    }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      startBackgroundSync()
    } else {
      stopBackgroundSync()
    }
    return () => {
      stopBackgroundSync()
    }
  }, [isAuthenticated])

  useEffect(() => {
    const savedUser = localStorage.getItem('active_username')
    const key = getActiveMasterKey()
    if (savedUser && key) {
      setIsAuthenticated(true)
      const savedLogbookId = localStorage.getItem('active_logbook_id')
      const savedLogbookTitle = localStorage.getItem('active_logbook_title')
      if (savedLogbookId && savedLogbookTitle) {
        setActiveLogbookId(savedLogbookId)
        setActiveLogbookTitle(savedLogbookTitle)
      }
    }
  }, [])

  const handleAuthenticated = () => {
    setIsAuthenticated(true)
    const savedLogbookId = localStorage.getItem('active_logbook_id')
    const savedLogbookTitle = localStorage.getItem('active_logbook_title')
    if (savedLogbookId && savedLogbookTitle) {
      setActiveLogbookId(savedLogbookId)
      setActiveLogbookTitle(savedLogbookTitle)
    }
  }

  const handleLogout = () => {
    logoutUser()
    setIsAuthenticated(false)
    setActiveLogbookId(null)
    setActiveLogbookTitle(null)
    localStorage.removeItem('active_logbook_id')
    localStorage.removeItem('active_logbook_title')
  }

  const handleSelectLogbook = (id: string, title: string) => {
    setActiveLogbookId(id)
    setActiveLogbookTitle(title)
    localStorage.setItem('active_logbook_id', id)
    localStorage.setItem('active_logbook_title', title)
  }

  const handleBackToDashboard = () => {
    setActiveLogbookId(null)
    setActiveLogbookTitle(null)
    localStorage.removeItem('active_logbook_id')
    localStorage.removeItem('active_logbook_title')
  }

  if (!isAuthenticated) {
    return <AuthOnboarding onAuthenticated={handleAuthenticated} />
  }

  if (!activeLogbookId) {
    return (
      <LogbookDashboard
        onSelectLogbook={handleSelectLogbook}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <div className="app-layout">
      {/* Active Logbook Header */}
      <header className="app-header">
        <div className="app-header-left">
          <button className="btn-back" onClick={handleBackToDashboard}>
            <ChevronLeft size={16} />
            {t('nav.dashboard')}
          </button>
          <div className="app-title-area">
            <h2>{activeLogbookTitle}</h2>
            <p className="app-subtitle">{t('app.name')} / {activeLogbookId.substring(0, 8)}...</p>
          </div>
        </div>

        <div className="header-actions">
          <div className={`conn-status ${online ? 'online' : 'offline'}`} title={online ? 'Online' : 'Offline'}>
            {online ? <Wifi size={18} /> : <WifiOff size={18} />}
            <span>{online ? 'Online' : t('sync.status_offline')}</span>
          </div>

          <button className="btn-icon logout" onClick={handleLogout} title={t('dashboard.logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Active Workspace */}
      <div className="app-body">
        {/* Navigation Sidebar */}
        <aside className="app-sidebar">
          <button
            className={`sidebar-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <FileText size={18} />
            {t('nav.logs')}
          </button>
          
          <button
            className={`sidebar-btn ${activeTab === 'vessel' ? 'active' : ''}`}
            onClick={() => setActiveTab('vessel')}
          >
            <Ship size={18} />
            {t('nav.vessel')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'crew' ? 'active' : ''}`}
            onClick={() => setActiveTab('crew')}
          >
            <Users size={18} />
            {t('nav.crew')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'deviation' ? 'active' : ''}`}
            onClick={() => setActiveTab('deviation')}
          >
            <Compass size={18} />
            {t('nav.deviation')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            {t('nav.settings')}
          </button>
        </aside>

        {/* Tab Content Panels (Placeholder until Phase 3) */}
        <main className="app-content">
          {activeTab === 'logs' && (
            <div className="tab-placeholder">
              <FileText size={48} className="header-logo" />
              <h3>{t('nav.logs')}</h3>
              <p>Journal event entries, GPS navigation records, and meteorological reports will be listed and edited here.</p>
            </div>
          )}

          {activeTab === 'vessel' && (
            <div className="tab-placeholder">
              <Ship size={48} className="header-logo" />
              <h3>{t('nav.vessel')}</h3>
              <p>Master vessel profile details such as name, home port, call sign, and MMSI registration are managed here.</p>
            </div>
          )}

          {activeTab === 'crew' && (
            <div className="tab-placeholder">
              <Users size={48} className="header-logo" />
              <h3>{t('nav.crew')}</h3>
              <p>Skipper, mate, and crew records conforming to marine credentials list are maintained here.</p>
            </div>
          )}

          {activeTab === 'deviation' && (
            <div className="tab-placeholder">
              <Compass size={48} className="header-logo" />
              <h3>{t('nav.deviation')}</h3>
              <p>Magnetic compass deviation table calibration grids and calculations are rendered here.</p>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="tab-placeholder">
              <Settings size={48} className="header-logo" />
              <h3>{t('nav.settings')}</h3>
              <p>Logbook sync properties, local cache maintenance, and CSV data tools are configured here.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
