import { useState, useEffect, useCallback } from 'react'
import './App.css'
import { DialogProvider } from './components/ModalDialog.tsx'
import AuthOnboarding from './components/AuthOnboarding.tsx'
import LogbookDashboard from './components/LogbookDashboard.tsx'
import VesselForm from './components/VesselForm.tsx'
import CrewForm from './components/CrewForm.tsx'
// Compass Deviation Table — für Freizeit-Skipper vorerst deaktiviert (Komponente bleibt erhalten)
// import DeviationForm from './components/DeviationForm.tsx'
import LogEntriesList from './components/LogEntriesList.tsx'
import SettingsForm from './components/SettingsForm.tsx'
import InvitationAcceptance from './components/InvitationAcceptance.tsx'
import AppTourOverlay from './components/AppTourOverlay.tsx'
import { AppTourProvider, useAppTour, type AppTab } from './context/AppTourContext.tsx'
import { getActiveMasterKey, logoutUser } from './services/auth.js'
import {
  applyAppearanceToDocument,
  resolveAppTheme,
  resolveColorScheme,
  subscribeToSystemColorScheme
} from './services/appearance.js'
import { startBackgroundSync, stopBackgroundSync, syncAllLogbooks, subscribeToSyncState } from './services/sync.js'
import ReadOnlyViewer from './components/ReadOnlyViewer.tsx'
import PwaInstallPrompt from './components/PwaInstallPrompt.tsx'
import PwaUpdatePrompt from './components/PwaUpdatePrompt.tsx'
import AppFooter from './components/AppFooter.tsx'
import { db } from './services/db.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ship, LogOut, ChevronLeft, Users, FileText, Settings, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  getStoredDemoFirstEntryId,
  seedDemoLogbookIfNeeded
} from './services/demoLogbook.js'

function App() {
  const { t } = useTranslation()
  const { registerNavigation, requestStartAfterLogin } = useAppTour()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeLogbookId, setActiveLogbookId] = useState<string | null>(null)
  const [activeLogbookTitle, setActiveLogbookTitle] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AppTab>('logs')
  const [tourSelectedEntryId, setTourSelectedEntryId] = useState<string | null>(null)
  const [demoHighlightEntryId, setDemoHighlightEntryId] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false)

  // Viewer mode for read-only shared links
  const [isViewerMode, setIsViewerMode] = useState(false)
  const [shareToken, setShareToken] = useState('')
  const [shareKey, setShareKey] = useState('')

  const syncQueueCount = useLiveQuery(
    () => activeLogbookId ? db.syncQueue.where({ logbookId: activeLogbookId }).count() : db.syncQueue.count(),
    [activeLogbookId]
  )

  useEffect(() => {
    const syncAppearance = () => {
      applyAppearanceToDocument(resolveAppTheme(), resolveColorScheme())
    }
    syncAppearance()
    window.addEventListener('appearance-changed', syncAppearance)
    const unsubscribeSystem = subscribeToSystemColorScheme(syncAppearance)
    return () => {
      window.removeEventListener('appearance-changed', syncAppearance)
      unsubscribeSystem()
    }
  }, [])

  useEffect(() => {
    return subscribeToSyncState((syncing) => {
      setIsSyncing(syncing)
    })
  }, [])

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
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))

    if (window.location.pathname === '/share' && params.has('token') && hashParams.has('key')) {
      setShareToken(params.get('token') || '')
      setShareKey(hashParams.get('key') || '')
      setIsViewerMode(true)
      return
    }

    if (params.has('token')) {
      setIsAcceptingInvite(true)
    }

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

  useEffect(() => {
    registerNavigation({
      setActiveTab,
      setSelectedEntryId: setTourSelectedEntryId
    })
  }, [registerNavigation])

  useEffect(() => {
    if (isAuthenticated && activeLogbookId) {
      setDemoHighlightEntryId(getStoredDemoFirstEntryId())
    }
  }, [isAuthenticated, activeLogbookId])

  const handleSelectLogbook = useCallback((id: string, title: string) => {
    setActiveLogbookId(id)
    setActiveLogbookTitle(title)
    setActiveTab('logs')
    setTourSelectedEntryId(null)
    localStorage.setItem('active_logbook_id', id)
    localStorage.setItem('active_logbook_title', title)
  }, [])

  const handleAuthenticated = async () => {
    setIsAuthenticated(true)

    try {
      const demo = await seedDemoLogbookIfNeeded()
      if (demo) {
        handleSelectLogbook(demo.logbookId, demo.title)
        if (demo.firstEntryId) {
          setDemoHighlightEntryId(demo.firstEntryId)
        }
        requestStartAfterLogin()
        return
      }
    } catch (err) {
      console.error('Failed to seed demo logbook:', err)
    }

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
    setTourSelectedEntryId(null)
    setDemoHighlightEntryId(null)
    localStorage.removeItem('active_logbook_id')
    localStorage.removeItem('active_logbook_title')
  }

  const handleBackToDashboard = () => {
    setActiveLogbookId(null)
    setActiveLogbookTitle(null)
    setTourSelectedEntryId(null)
    localStorage.removeItem('active_logbook_id')
    localStorage.removeItem('active_logbook_title')
  }

  if (isViewerMode) {
    return (
      <div style={{ display: 'contents' }}>
        <ReadOnlyViewer token={shareToken} hexKey={shareKey} />
      </div>
    )
  }

  if (isAcceptingInvite) {
    return (
      <div className="auth-screen">
        <InvitationAcceptance
          onAccepted={(logbookId, title) => {
            setIsAuthenticated(true)
            setIsAcceptingInvite(false)
            handleSelectLogbook(logbookId, title)
            // Clean URL query parameters and hash anchor
            window.history.replaceState({}, document.title, window.location.pathname)
          }}
          onCancel={() => {
            setIsAcceptingInvite(false)
            window.history.replaceState({}, document.title, window.location.pathname)
          }}
        />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-screen">
        <AuthOnboarding onAuthenticated={handleAuthenticated} />
      </div>
    )
  }

  const pwaInstallBanner = <PwaInstallPrompt variant="banner" />

  if (!activeLogbookId) {
    return (
      <div style={{ display: 'contents' }}>
        {pwaInstallBanner}
        <LogbookDashboard
          onSelectLogbook={handleSelectLogbook}
          onLogout={handleLogout}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'contents' }}>
      {pwaInstallBanner}
      {isSyncing && <div className="sync-progress-bar" />}
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
            {syncQueueCount !== undefined && syncQueueCount > 0 && (
              <div className="conn-status warning" title={`${syncQueueCount} unsynced changes`}>
                <span className="pulse-dot"></span>
                <span>{t('sync.status_unsynced')} ({syncQueueCount})</span>
              </div>
            )}

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
            data-tour="nav-logs"
          >
            <FileText size={18} />
            {t('nav.logs')}
          </button>
          
          <button
            className={`sidebar-btn ${activeTab === 'vessel' ? 'active' : ''}`}
            onClick={() => setActiveTab('vessel')}
            data-tour="nav-vessel"
          >
            <Ship size={18} />
            {t('nav.vessel')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'crew' ? 'active' : ''}`}
            onClick={() => setActiveTab('crew')}
            data-tour="nav-crew"
          >
            <Users size={18} />
            {t('nav.crew')}
          </button>

          {/* Compass Deviation Table — für Freizeit-Skipper vorerst ausgeblendet
          <button
            className={`sidebar-btn ${activeTab === 'deviation' ? 'active' : ''}`}
            onClick={() => setActiveTab('deviation')}
          >
            <Compass size={18} />
            {t('nav.deviation')}
          </button>
          */}

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
            <LogEntriesList
              logbookId={activeLogbookId}
              controlledSelectedEntryId={tourSelectedEntryId}
              onSelectedEntryIdChange={setTourSelectedEntryId}
              highlightEntryId={demoHighlightEntryId}
            />
          )}

          {activeTab === 'vessel' && (
            <VesselForm logbookId={activeLogbookId} />
          )}

          {activeTab === 'crew' && (
            <CrewForm logbookId={activeLogbookId} />
          )}

          {/* Compass Deviation Table — für Freizeit-Skipper vorerst deaktiviert
          {activeTab === 'deviation' && (
            <DeviationForm logbookId={activeLogbookId} />
          )}
          */}

          {activeTab === 'settings' && (
            <SettingsForm logbookId={activeLogbookId} />
          )}
        </main>
      </div>
    </div>
  </div>
  )
}

export default function AppWrapper() {
  return (
    <DialogProvider>
      <AppTourProvider>
        <PwaUpdatePrompt />
        <App />
        <AppTourOverlay />
      </AppTourProvider>
      <AppFooter />
    </DialogProvider>
  )
}
