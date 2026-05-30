import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../services/db.js'
import { fetchLogbooks, createLogbook, deleteLogbook, type DecryptedLogbook } from '../services/logbook.js'
import LogbookRoleBadge from './LogbookRoleBadge.tsx'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { logoutUser } from '../services/auth.js'
import { useDialog } from './ModalDialog.tsx'
import AccountDangerZone from './AccountDangerZone.tsx'
import { BookOpen, Plus, Trash2, LogOut, Languages, RefreshCw, Ship, User, Wifi, WifiOff } from 'lucide-react'
import DisclaimerHeaderButton from './DisclaimerHeaderButton.tsx'
import FeedbackHeaderButton from './FeedbackHeaderButton.tsx'

interface LogbookDashboardProps {
  onSelectLogbook: (id: string, title: string) => void
  onLogout: () => void
}

export default function LogbookDashboard({ onSelectLogbook, onLogout }: LogbookDashboardProps) {
  const { t, i18n } = useTranslation()
  const { showConfirm } = useDialog()
  const [logbooks, setLogbooks] = useState<DecryptedLogbook[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [username] = useState(localStorage.getItem('active_username') || 'Skipper')

  // Reactive sync queue count
  const pendingCount = useLiveQuery(() => db.syncQueue.count()) || 0

  // Listen to connectivity changes
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load logbooks on mount
  useEffect(() => {
    loadLogbooks()
  }, [])

  const loadLogbooks = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchLogbooks()
      setLogbooks(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load logbooks')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    setLoading(true)
    setError(null)
    try {
      const created = await createLogbook(newTitle.trim())
      setLogbooks((prev) => [created, ...prev])
      setNewTitle('')
      trackPlausibleEvent(PlausibleEvents.LOGBOOK_CREATED)
    } catch (err: any) {
      setError(err.message || 'Failed to create logbook')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent selecting the logbook when clicking delete
    
    if (await showConfirm(t('dashboard.delete_confirm'), t('dashboard.delete_btn'), t('logs.confirm_yes'), t('logs.confirm_no'))) {
      setLoading(true)
      setError(null)
      try {
        await deleteLogbook(id)
        setLogbooks((prev) => prev.filter((lb) => lb.id !== id))
      } catch (err: any) {
        setError(err.message || 'Failed to delete logbook')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleLogout = () => {
    void logoutUser()
    onLogout()
  }

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('de') ? 'en' : 'de'
    i18n.changeLanguage(nextLang)
  }

  const ownedLogbooks = logbooks.filter((lb) => !lb.isShared)
  const sharedLogbooks = logbooks.filter((lb) => lb.isShared)

  const renderLogbookCard = (lb: DecryptedLogbook) => (
    <div
      key={lb.id}
      className={`logbook-card glass${lb.isShared ? ' logbook-card--shared' : ''}`}
      onClick={() => onSelectLogbook(lb.id, lb.title)}
    >
      <div className="card-icon">
        <BookOpen size={24} />
      </div>

      <div className="card-info">
        <div className="card-title-row">
          <h3>{lb.title}</h3>
          <LogbookRoleBadge role={lb.accessRole} />
        </div>
        <div className="card-meta">
          <span className={`sync-badge ${lb.isSynced ? 'synced' : 'local'}`}>
            {lb.isSynced ? t('dashboard.status_synced') : t('dashboard.status_local')}
          </span>
          {lb.isDemo && (
            <span className="demo-badge">{t('demo.badge')}</span>
          )}
          <span className="date-badge">
            {new Date(lb.updatedAt).toLocaleDateString(i18n.language, {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })}
          </span>
        </div>
      </div>

      <button
        className="btn-delete"
        onClick={(e) => handleDelete(lb.id, e)}
        title={t('dashboard.delete_btn')}
        style={{ visibility: lb.isShared ? 'hidden' : 'visible' }}
      >
        <Trash2 size={18} />
      </button>
    </div>
  )

  const renderLogbookSection = (
    title: string,
    items: DecryptedLogbook[],
    hint?: string
  ) => (
    <div className="logbook-section">
      <div className="logbook-section-header">
        <h3>{title}</h3>
        {hint && <p className="logbook-section-hint">{hint}</p>}
      </div>
      <div className="logbooks-grid">
        {items.map(renderLogbookCard)}
      </div>
    </div>
  )

  return (
    <div className="dashboard-container">
      {/* Premium Dashboard Header */}
      <header className="dashboard-header">
        <div className="header-brand">
          <Ship className="header-logo" size={32} />
          <div>
            <h1>{t('app.name')}</h1>
            <p className="subtitle">{t('app.tagline')}</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Connection Indicator */}
          <div className={`conn-status ${online ? (pendingCount > 0 ? 'unsynced' : 'online') : 'offline'}`} title={online ? (pendingCount > 0 ? 'Pending Sync' : 'Synced') : 'Offline'}>
            {online ? (
              pendingCount > 0 ? (
                <>
                  <RefreshCw size={18} className="spin" />
                  <span>{t('sync.status_unsynced')} ({pendingCount})</span>
                </>
              ) : (
                <>
                  <Wifi size={18} />
                  <span>{t('sync.status_synced')}</span>
                </>
              )
            ) : (
              <>
                <WifiOff size={18} />
                <span>{t('sync.status_offline')}</span>
              </>
            )}
          </div>

          {/* Skipper profile */}
          <div
            className="skipper-badge"
            title={t('dashboard.logged_in_as', { name: username })}
            aria-label={t('dashboard.logged_in_as', { name: username })}
          >
            <User size={16} aria-hidden="true" />
            <span className="skipper-badge__name">{username}</span>
          </div>

          {/* Lang toggle */}
          <button className="btn-icon" onClick={toggleLanguage} title="Switch Language">
            <Languages size={18} />
          </button>

          <DisclaimerHeaderButton />

          <FeedbackHeaderButton />

          {/* Logout */}
          <button className="btn-icon logout" onClick={handleLogout} title={t('dashboard.logout')}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Dashboard Layout */}
      <main className="dashboard-main">
        {/* Left Side: Create form */}
        <section className="create-section glass">
          <h2>{t('dashboard.create_btn')}</h2>
          <form onSubmit={handleCreate} className="dashboard-form">
            <div className="input-group">
              <input
                type="text"
                className="input-text"
                placeholder={t('dashboard.new_logbook_placeholder')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button type="submit" className="btn primary" disabled={loading || !newTitle.trim()}>
              <Plus size={18} />
              {t('dashboard.create_btn')}
            </button>
          </form>

          {error && <div className="auth-error mt-4">{error}</div>}
        </section>

        {/* Right Side: Logbooks list */}
        <section className="list-section">
          <div className="section-title-bar">
            <h2>{t('dashboard.title')}</h2>
            <button className="btn-refresh" onClick={() => loadLogbooks(true)} disabled={loading || refreshing}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            </button>
          </div>

          {loading && !refreshing ? (
            <div className="dashboard-status-msg">{t('dashboard.loading')}</div>
          ) : logbooks.length === 0 ? (
            <div className="dashboard-status-msg glass">{t('dashboard.no_logbooks')}</div>
          ) : (
            <div className="logbook-sections">
              {ownedLogbooks.length > 0 && renderLogbookSection(
                sharedLogbooks.length > 0 ? t('dashboard.section_owned') : t('dashboard.title'),
                ownedLogbooks
              )}
              {sharedLogbooks.length > 0 && renderLogbookSection(
                t('dashboard.section_shared'),
                sharedLogbooks,
                t('dashboard.section_shared_hint')
              )}
            </div>
          )}
        </section>
      </main>

      <section className="dashboard-account-section" aria-label={t('settings.danger_zone_title')}>
        <AccountDangerZone />
      </section>
    </div>
  )
}
