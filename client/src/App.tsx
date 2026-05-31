import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import { DialogProvider } from './components/ModalDialog.tsx'
import AuthOnboarding from './components/AuthOnboarding.tsx'
import UserProfilePage from './components/UserProfilePage.tsx'
import LogbookDashboard from './components/LogbookDashboard.tsx'
import VesselForm from './components/VesselForm.tsx'
import CrewForm from './components/CrewForm.tsx'
// Compass Deviation Table — für Freizeit-Skipper vorerst deaktiviert (Komponente bleibt erhalten)
// import DeviationForm from './components/DeviationForm.tsx'
import LogEntriesList from './components/LogEntriesList.tsx'
import StatsDashboard from './components/StatsDashboard.tsx'
import SettingsForm from './components/SettingsForm.tsx'
import InvitationAcceptance from './components/InvitationAcceptance.tsx'
import AppTourOverlay from './components/AppTourOverlay.tsx'
import { AppTourProvider, useAppTour, type AppTab } from './context/AppTourContext.tsx'
import { UnsavedChangesProvider, useUnsavedChangesContext } from './context/UnsavedChangesContext.tsx'
import {
  logoutUser,
  checkServerSession,
  hasUnlockedLocalSession,
  persistSessionUserId
} from './services/auth.js'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'
import { PlausibleEvents, trackPlausibleEvent } from './services/analytics.js'
import {
  applyAppearanceToDocument,
  resolveAppTheme,
  resolveColorScheme,
  subscribeToSystemColorScheme
} from './services/appearance.js'
import { syncAppearancePrefs } from './services/appearancePrefs.js'
import { startBackgroundSync, stopBackgroundSync, syncAllLogbooks, subscribeToSyncState } from './services/sync.js'
import ReadOnlyViewer from './components/ReadOnlyViewer.tsx'
import DemoViewer from './components/DemoViewer.tsx'
import PwaInstallPrompt from './components/PwaInstallPrompt.tsx'
import PwaUpdatePrompt from './components/PwaUpdatePrompt.tsx'
import AppFooter from './components/AppFooter.tsx'
import LogbookRoleBadge from './components/LogbookRoleBadge.tsx'
import BetaBadge from './components/BetaBadge.tsx'
import { db } from './services/db.js'
import { getLogbookAccess } from './services/logbookAccess.js'
import type { LogbookAccessRole } from './services/logbook.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ship, LogOut, ChevronLeft, Users, FileText, Settings, Wifi, WifiOff, Languages, BarChart2 } from 'lucide-react'
import DisclaimerHeaderButton from './components/DisclaimerHeaderButton.tsx'
import FeedbackHeaderButton from './components/FeedbackHeaderButton.tsx'
import { useTranslation } from 'react-i18next'
import {
  resolveTourLogbookContext,
  seedDemoLogbookIfNeeded
} from './services/demoLogbook.js'
import { fetchLogbooks, parseCollaborationRole } from './services/logbook.js'
import { ensurePushSubscriptionIfEnabled } from './services/pushNotifications.js'

const PENDING_PUSH_LOGBOOK_KEY = 'pending_push_logbook_id'

function App() {
  const { t, i18n } = useTranslation()
  const { confirmLeave } = useUnsavedChangesContext()
  const { registerNavigation, registerDemoTourContext, requestStartAfterLogin, isActive, currentStepId } = useAppTour()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeLogbookId, setActiveLogbookId] = useState<string | null>(null)
  const [activeLogbookTitle, setActiveLogbookTitle] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AppTab>('logs')
  const [tourSelectedEntryId, setTourSelectedEntryId] = useState<string | null>(null)
  const [tourFeedbackOpen, setTourFeedbackOpen] = useState(false)
  const [demoHighlightEntryId, setDemoHighlightEntryId] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false)
  const [showUserProfile, setShowUserProfile] = useState(false)
  const tourLogbookRef = useRef<{ id: string; title: string } | null>(null)
  const activeLogbookRef = useRef<{ id: string | null; title: string | null }>({
    id: activeLogbookId,
    title: activeLogbookTitle
  })
  activeLogbookRef.current = { id: activeLogbookId, title: activeLogbookTitle }

  // Viewer mode for read-only shared links
  const [isViewerMode, setIsViewerMode] = useState(false)
  const [shareToken, setShareToken] = useState('')
  const [shareKey, setShareKey] = useState('')

  // Public demo mode (no account required)
  const [isDemoMode, setIsDemoMode] = useState(() => window.location.pathname === '/demo')

  const syncQueueCount = useLiveQuery(
    () => activeLogbookId ? db.syncQueue.where({ logbookId: activeLogbookId }).count() : db.syncQueue.count(),
    [activeLogbookId]
  )

  const activeLogbookRecord = useLiveQuery(
    () => (activeLogbookId ? db.logbooks.get(activeLogbookId) : undefined),
    [activeLogbookId]
  )

  const [activeAccessRole, setActiveAccessRole] = useState<LogbookAccessRole | null>('OWNER')

  useEffect(() => {
    if (!activeLogbookId) {
      setActiveAccessRole('OWNER')
      return
    }

    if (!activeLogbookRecord) {
      setActiveAccessRole(null)
      return
    }

    if (activeLogbookRecord.isShared !== 1) {
      setActiveAccessRole('OWNER')
      return
    }

    const cachedRole = activeLogbookRecord.collaborationRole
    setActiveAccessRole(
      cachedRole ? parseCollaborationRole(cachedRole, `logbook ${activeLogbookId}`) : null
    )

    let cancelled = false
    getLogbookAccess(activeLogbookId)
      .then((access) => {
        if (cancelled || !access) return
        setActiveAccessRole(access.role)
      })
      .catch((err) => {
        console.warn('Failed to resolve logbook access role:', err)
      })

    return () => {
      cancelled = true
    }
  }, [activeLogbookId, activeLogbookRecord])

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
    if (!isAuthenticated) return
    const userId = localStorage.getItem('active_userid')
    if (!userId) return
    void syncAppearancePrefs(userId)
  }, [isAuthenticated])

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

  const syncRouteFromLocation = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const path = window.location.pathname

    if (path === '/demo') {
      setIsDemoMode(true)
      setIsViewerMode(false)
      setIsAcceptingInvite(false)
      return
    }

    setIsDemoMode(false)

    if (path === '/share' && params.has('token') && hashParams.has('key')) {
      setShareToken(params.get('token') || '')
      setShareKey(hashParams.get('key') || '')
      setIsViewerMode(true)
      setIsAcceptingInvite(false)
      return
    }

    setIsViewerMode(false)

    if (params.has('token')) {
      setIsAcceptingInvite(true)
      return
    }

    setIsAcceptingInvite(false)

    const openLogbookId = params.get('logbook')
    if (openLogbookId) {
      sessionStorage.setItem(PENDING_PUSH_LOGBOOK_KEY, openLogbookId)
      const cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete('logbook')
      window.history.replaceState(
        {},
        document.title,
        `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`
      )
    }
  }, [])

  const clearAuthenticatedAppState = useCallback(() => {
    setIsAuthenticated(false)
    setActiveLogbookId(null)
    setActiveLogbookTitle(null)
    setShowUserProfile(false)
    setTourSelectedEntryId(null)
    setDemoHighlightEntryId(null)
  }, [])

  /** After PWA/bfcache resume, React state may still say "logged in" while the master key is gone. */
  const enforceUnlockedSession = useCallback(() => {
    if (isViewerMode || isDemoMode || isAcceptingInvite) return
    // Require full local session (incl. userId) so API calls are not left headless.
    if (isAuthenticated && !hasUnlockedLocalSession()) {
      clearAuthenticatedAppState()
    }
  }, [
    isAuthenticated,
    isViewerMode,
    isDemoMode,
    isAcceptingInvite,
    clearAuthenticatedAppState
  ])

  useEffect(() => {
    enforceUnlockedSession()
  }, [enforceUnlockedSession])

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        enforceUnlockedSession()
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        enforceUnlockedSession()
      }
    }
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enforceUnlockedSession])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const session = await checkServerSession()
        if (cancelled) return

        if (session.authenticated) {
          persistSessionUserId(session.userId)
        }

        // Cookie alone is insufficient — need in-memory master key, username, and userId for API.
        if (session.authenticated && hasUnlockedLocalSession()) {
          setIsAuthenticated(true)
          const savedLogbookId = localStorage.getItem('active_logbook_id')
          const savedLogbookTitle = localStorage.getItem('active_logbook_title')
          if (savedLogbookId && savedLogbookTitle) {
            setActiveLogbookId(savedLogbookId)
            setActiveLogbookTitle(savedLogbookTitle)
          }
        }
        // authenticated + crypto but no userId: stay on login (enforceUnlockedSession guards active UI)
      } catch (err) {
        if (!cancelled) {
          console.warn('Session restore failed:', err)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [clearAuthenticatedAppState])

  useEffect(() => {
    syncRouteFromLocation()
    window.addEventListener('popstate', syncRouteFromLocation)
    return () => window.removeEventListener('popstate', syncRouteFromLocation)
  }, [syncRouteFromLocation])

  const openDemo = useCallback(() => {
    window.history.pushState({}, document.title, '/demo')
    setIsDemoMode(true)
    setIsViewerMode(false)
    setIsAcceptingInvite(false)
  }, [])

  const selectLogbook = useCallback((id: string, title: string) => {
    setActiveLogbookId(id)
    setActiveLogbookTitle(title)
    setActiveTab('logs')
    setTourSelectedEntryId(null)
    localStorage.setItem('active_logbook_id', id)
    localStorage.setItem('active_logbook_title', title)
  }, [])

  const ensureTourLogbookOpen = useCallback(async () => {
    const ctx = await resolveTourLogbookContext(tourLogbookRef.current?.id)
    if (!ctx) return

    if (activeLogbookRef.current.id !== ctx.logbookId) {
      selectLogbook(ctx.logbookId, ctx.title)
    }

    if (ctx.firstEntryId) {
      setDemoHighlightEntryId(ctx.firstEntryId)
      registerDemoTourContext({ firstEntryId: ctx.firstEntryId })
    }
  }, [registerDemoTourContext, selectLogbook])

  useEffect(() => {
    registerNavigation({
      setActiveTab,
      setSelectedEntryId: setTourSelectedEntryId,
      setFeedbackOpen: setTourFeedbackOpen,
      setProfileOpen: setShowUserProfile,
      ensureLogbookForTour: ensureTourLogbookOpen,
      setLogbookActive: (active) => {
        if (active) {
          void ensureTourLogbookOpen()
          return
        }

        const { id, title } = activeLogbookRef.current
        if (id && title) {
          tourLogbookRef.current = { id, title }
        }
        setActiveLogbookId(null)
        setActiveLogbookTitle(null)
        setTourSelectedEntryId(null)
        localStorage.removeItem('active_logbook_id')
        localStorage.removeItem('active_logbook_title')
      }
    })
  }, [ensureTourLogbookOpen, registerNavigation])

  useEffect(() => {
    if (!isAuthenticated || !activeLogbookId) return
    void (async () => {
      const ctx = await resolveTourLogbookContext()
      if (!ctx || ctx.logbookId !== activeLogbookId) return
      if (ctx.firstEntryId) {
        setDemoHighlightEntryId(ctx.firstEntryId)
        registerDemoTourContext({ firstEntryId: ctx.firstEntryId })
      }
    })()
  }, [isAuthenticated, activeLogbookId, registerDemoTourContext])

  const openLogbookById = useCallback(
    async (logbookId: string) => {
      try {
        const books = await fetchLogbooks()
        const match = books.find((b) => b.id === logbookId)
        if (match) {
          selectLogbook(match.id, match.title)
          return
        }
      } catch (err) {
        console.error('Failed to resolve logbook from push:', err)
      }
      selectLogbook(logbookId, `${logbookId.slice(0, 8)}…`)
    },
    [selectLogbook]
  )

  const consumePendingPushLogbook = useCallback(() => {
    const pending = sessionStorage.getItem(PENDING_PUSH_LOGBOOK_KEY)
    if (!pending) return
    sessionStorage.removeItem(PENDING_PUSH_LOGBOOK_KEY)
    void openLogbookById(pending)
  }, [openLogbookById])

  useEffect(() => {
    if (isAuthenticated) {
      consumePendingPushLogbook()
    }
  }, [isAuthenticated, consumePendingPushLogbook])

  useEffect(() => {
    if (!isAuthenticated || !('serviceWorker' in navigator)) return

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_LOGBOOK' && typeof event.data.logbookId === 'string') {
        void openLogbookById(event.data.logbookId)
      }
    }

    navigator.serviceWorker.addEventListener('message', onSwMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage)
  }, [isAuthenticated, openLogbookById])

  const handleAuthenticated = async () => {
    setIsAuthenticated(true)
    trackPlausibleEvent(PlausibleEvents.LOGGED_IN)
    void ensurePushSubscriptionIfEnabled()

    try {
      const demo = await seedDemoLogbookIfNeeded()
      if (demo) {
        selectLogbook(demo.logbookId, demo.title)
        if (demo.firstEntryId) {
          setDemoHighlightEntryId(demo.firstEntryId)
        }
        requestStartAfterLogin()
        consumePendingPushLogbook()
        return
      }
    } catch (err) {
      console.error('Failed to seed demo logbook:', err)
    }

    const savedLogbookId = localStorage.getItem('active_logbook_id')
    const savedLogbookTitle = localStorage.getItem('active_logbook_title')
    if (savedLogbookId && savedLogbookTitle) {
      try {
        const books = await fetchLogbooks()
        const match = books.find((b) => b.id === savedLogbookId)
        if (match) {
          setActiveLogbookId(match.id)
          setActiveLogbookTitle(match.title)
        } else {
          localStorage.removeItem('active_logbook_id')
          localStorage.removeItem('active_logbook_title')
        }
      } catch {
        setActiveLogbookId(savedLogbookId)
        setActiveLogbookTitle(savedLogbookTitle)
      }
    }
    consumePendingPushLogbook()
  }

  const handleTabChange = async (tab: AppTab) => {
    if (tab === activeTab) return
    if (!(await confirmLeave())) return
    setActiveTab(tab)
  }

  const handleLogout = async () => {
    if (!(await confirmLeave())) return
    void logoutUser()
    setIsAuthenticated(false)
    setActiveLogbookId(null)
    setActiveLogbookTitle(null)
    setShowUserProfile(false)
    setTourSelectedEntryId(null)
    setDemoHighlightEntryId(null)
    localStorage.removeItem('active_logbook_id')
    localStorage.removeItem('active_logbook_title')
  }

  const handleBackToDashboard = async () => {
    if (!(await confirmLeave())) return
    setActiveLogbookId(null)
    setActiveLogbookTitle(null)
    setTourSelectedEntryId(null)
    localStorage.removeItem('active_logbook_id')
    localStorage.removeItem('active_logbook_title')
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('de') ? 'en' : 'de'
    i18n.changeLanguage(nextLang)
  }

  const handleExitDemo = () => {
    window.history.replaceState({}, document.title, '/')
    syncRouteFromLocation()
  }

  if (isDemoMode) {
    return (
      <div style={{ display: 'contents' }}>
        <DemoViewer onExit={handleExitDemo} />
      </div>
    )
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
            trackPlausibleEvent(PlausibleEvents.LOGGED_IN)
            setIsAcceptingInvite(false)
            selectLogbook(logbookId, title)
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
        <AuthOnboarding onAuthenticated={handleAuthenticated} onOpenDemo={openDemo} />
      </div>
    )
  }

  const pwaInstallBanner = !isActive ? <PwaInstallPrompt variant="banner" /> : null

  const logbookReadOnly =
    activeLogbookRecord?.isShared === 1 && activeAccessRole === 'READ'
  const isLogbookOwner =
    activeAccessRole === 'OWNER' || activeLogbookRecord?.isShared !== 1

  if (!activeLogbookId) {
    return (
      <div style={{ display: 'contents' }}>
        {pwaInstallBanner}
        {showUserProfile ? (
          <UserProfilePage
            onBack={() => setShowUserProfile(false)}
            onLogout={handleLogout}
          />
        ) : (
          <LogbookDashboard
            onSelectLogbook={selectLogbook}
            onLogout={handleLogout}
            onOpenProfile={() => setShowUserProfile(true)}
          />
        )}
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
            <button className="btn-back" onClick={handleBackToDashboard} title={t('nav.dashboard')}>
              <ChevronLeft size={16} />
              <span className="hide-mobile">{t('nav.dashboard')}</span>
            </button>
            <div className="app-title-area">
              <div className="app-title-row">
                <h2>{activeLogbookTitle}</h2>
                <BetaBadge />
                {activeAccessRole && activeAccessRole !== 'OWNER' && (
                  <LogbookRoleBadge role={activeAccessRole} />
                )}
              </div>
              <p className="app-subtitle">
                {activeAccessRole && activeAccessRole !== 'OWNER'
                  ? t('dashboard.section_shared_hint')
                  : `${t('app.name')} / ${activeLogbookId?.substring(0, 8)}...`}
              </p>
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

            <button className="btn-icon" onClick={toggleLanguage} title="Switch Language">
              <Languages size={18} />
            </button>

            <DisclaimerHeaderButton />

            <FeedbackHeaderButton
              logbookId={activeLogbookId}
              logbookTitle={activeLogbookTitle}
              tourOpen={tourFeedbackOpen}
              onTourOpenChange={setTourFeedbackOpen}
              tourHighlight={isActive && currentStepId === 'nav_feedback'}
            />

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
            onClick={() => void handleTabChange('logs')}
            data-tour="nav-logs"
          >
            <FileText size={18} />
            {t('nav.logs')}
          </button>
          
          <button
            className={`sidebar-btn ${activeTab === 'vessel' ? 'active' : ''}`}
            onClick={() => void handleTabChange('vessel')}
            data-tour="nav-vessel"
          >
            <Ship size={18} />
            {t('nav.vessel')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'crew' ? 'active' : ''}`}
            onClick={() => void handleTabChange('crew')}
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
            className={`sidebar-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => void handleTabChange('stats')}
            data-tour="nav-stats"
          >
            <BarChart2 size={18} />
            {t('nav.stats')}
          </button>

          <button
            className={`sidebar-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => void handleTabChange('settings')}
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
              readOnly={logbookReadOnly}
              controlledSelectedEntryId={tourSelectedEntryId}
              onSelectedEntryIdChange={setTourSelectedEntryId}
              highlightEntryId={demoHighlightEntryId}
            />
          )}

          {activeTab === 'vessel' && (
            <VesselForm logbookId={activeLogbookId} readOnly={logbookReadOnly || !isLogbookOwner} />
          )}

          {activeTab === 'crew' && (
            <CrewForm
              logbookId={activeLogbookId}
              readOnly={logbookReadOnly}
              skipperReadOnly={!isLogbookOwner}
            />
          )}

          {activeTab === 'stats' && activeLogbookId && activeLogbookTitle && (
            <StatsDashboard logbookId={activeLogbookId} logbookTitle={activeLogbookTitle} />
          )}

          {/* Compass Deviation Table — für Freizeit-Skipper vorerst deaktiviert
          {activeTab === 'deviation' && (
            <DeviationForm logbookId={activeLogbookId} />
          )}
          */}

          {activeTab === 'settings' && (
            <SettingsForm
              logbookId={activeLogbookId}
              onLogbookRestored={selectLogbook}
            />
          )}
        </main>
      </div>
    </div>
  </div>
  )
}

export default function AppWrapper() {
  return (
    <AppErrorBoundary>
      <DialogProvider>
        <UnsavedChangesProvider>
          <AppTourProvider>
            <PwaUpdatePrompt />
            <App />
            <AppTourOverlay />
          </AppTourProvider>
          <AppFooter />
        </UnsavedChangesProvider>
      </DialogProvider>
    </AppErrorBoundary>
  )
}
