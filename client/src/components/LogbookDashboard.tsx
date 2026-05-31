import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSyncIndicator } from '../hooks/useSyncIndicator.js'
import { fetchLogbooks, createLogbook, deleteLogbook, updateLogbookTitle, type DecryptedLogbook } from '../services/logbook.js'
import LogbookRoleBadge from './LogbookRoleBadge.tsx'
import BetaBadge from './BetaBadge.tsx'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { logoutUser } from '../services/auth.js'
import { useDialog } from './ModalDialog.tsx'
import { BookOpen, Plus, Trash2, LogOut, Languages, RefreshCw, Ship, User, Wifi, WifiOff } from 'lucide-react'
import DisclaimerHeaderButton from './DisclaimerHeaderButton.tsx'
import FeedbackHeaderButton from './FeedbackHeaderButton.tsx'

interface LogbookDashboardProps {
  onSelectLogbook: (id: string, title: string) => void
  onLogout: () => void
  onOpenProfile: () => void
}

export default function LogbookDashboard({ onSelectLogbook, onLogout, onOpenProfile }: LogbookDashboardProps) {
  const { t, i18n } = useTranslation()
  const { showConfirm } = useDialog()
  const [logbooks, setLogbooks] = useState<DecryptedLogbook[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [editingLogbookId, setEditingLogbookId] = useState<string | null>(null)
  const [editingTitleDraft, setEditingTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [username] = useState(localStorage.getItem('active_username') || 'Skipper')

  const { pendingCount, showSpinner, showPendingWarning, connStatusClassName } = useSyncIndicator()

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

  useEffect(() => {
    if (editingLogbookId) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingLogbookId])

  const startTitleEdit = (lb: DecryptedLogbook, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingLogbookId(lb.id)
    setEditingTitleDraft(lb.title)
  }

  const cancelTitleEdit = () => {
    setEditingLogbookId(null)
    setEditingTitleDraft('')
  }

  const commitTitleEdit = async (id: string) => {
    if (editingLogbookId !== id) return

    const lb = logbooks.find((item) => item.id === id)
    const trimmedTitle = editingTitleDraft.trim()
    cancelTitleEdit()

    if (!lb || !trimmedTitle || trimmedTitle === lb.title.trim()) return

    setLoading(true)
    setError(null)
    try {
      await updateLogbookTitle(id, trimmedTitle)
      setLogbooks((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, title: trimmedTitle, updatedAt: new Date().toISOString() } : item
        )
      )
    } catch (err: any) {
      setError(err.message || 'Failed to update logbook title')
    } finally {
      setLoading(false)
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

  const renderLogbookCard = (lb: DecryptedLogbook) => {
    const isEditingTitle = editingLogbookId === lb.id

    return (
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
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              className="logbook-title-inline-edit input-text"
              value={editingTitleDraft}
              onChange={(e) => setEditingTitleDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitTitleEdit(lb.id)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelTitleEdit()
                }
              }}
              onBlur={() => void commitTitleEdit(lb.id)}
              disabled={loading}
              aria-label={t('dashboard.edit_title')}
            />
          ) : (
            <h3
              className={lb.isShared ? undefined : 'logbook-title-editable'}
              onClick={lb.isShared ? undefined : (e) => startTitleEdit(lb, e)}
              title={lb.isShared ? undefined : t('dashboard.edit_title')}
            >
              {lb.title}
            </h3>
          )}
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

      {!lb.isShared && (
        <div className="logbook-card-actions">
          <button
            type="button"
            className="btn-delete"
            onClick={(e) => handleDelete(lb.id, e)}
            title={t('dashboard.delete_btn')}
            aria-label={t('dashboard.delete_btn')}
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
    </div>
    )
  }

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
            <div className="header-brand-title-row">
              <h1>{t('app.name')}</h1>
              <BetaBadge />
            </div>
            <p className="subtitle">{t('app.tagline')}</p>
          </div>
        </div>

        <div className="header-actions">
          {/* Connection Indicator */}
          <div
            className={connStatusClassName(online)}
            title={
              online
                ? showSpinner
                  ? 'Syncing'
                  : pendingCount > 0
                    ? 'Pending Sync'
                    : 'Synced'
                : 'Offline'
            }
          >
            {online ? (
              showSpinner ? (
                <>
                  <RefreshCw size={18} className="spin" />
                  <span>{t('sync.status_syncing')}</span>
                </>
              ) : showPendingWarning ? (
                <>
                  <RefreshCw size={18} />
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
          <button
            type="button"
            className="btn-icon skipper-badge"
            onClick={onOpenProfile}
            title={t('dashboard.open_profile', { name: username })}
            aria-label={t('dashboard.open_profile', { name: username })}
            data-tour="nav-profile"
          >
            <User size={18} aria-hidden="true" />
            <span className="skipper-badge__name">{username}</span>
          </button>

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
    </div>
  )
}
