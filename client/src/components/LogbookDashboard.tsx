import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageDropdown from './LanguageDropdown.tsx'
import { useSyncIndicator } from '../hooks/useSyncIndicator.js'
import { fetchLogbooks, createLogbook, deleteLogbook, updateLogbookTitle, type DecryptedLogbook } from '../services/logbook.js'
import { loadLogbookSearchFieldsBatch } from '../services/logbookSearchIndex.js'
import { logbookMatchesFilter, type LogbookSearchFields } from '../utils/logbookFilter.js'
import LogbookRoleBadge from './LogbookRoleBadge.tsx'
import BetaBadge from './BetaBadge.tsx'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { getErrorMessage } from '../utils/errors.js'
import { logoutUser } from '../services/auth.js'
import { useDialog } from './ModalDialog.tsx'
import { BookOpen, Plus, Trash2, LogOut, RefreshCw, Ship, Wifi, WifiOff, Search, X, CalendarDays, CaseSensitive, ArrowUp, ArrowDown } from 'lucide-react'
import DisclaimerHeaderButton from './DisclaimerHeaderButton.tsx'
import FeedbackHeaderButton from './FeedbackHeaderButton.tsx'
import ProfileHeaderButton from './ProfileHeaderButton.tsx'
import AdminHeaderButton from './AdminHeaderButton.tsx'

interface LogbookDashboardProps {
  onSelectLogbook: (id: string, title: string) => void
  onLogout: () => void
  onOpenProfile: () => void
  onOpenAdmin?: () => void
}

type LogbookSortKey = 'name' | 'date'
type LogbookSortDirection = 'asc' | 'desc'

function sortLogbooks(
  items: DecryptedLogbook[],
  sortBy: LogbookSortKey,
  direction: LogbookSortDirection,
  locale: string
): DecryptedLogbook[] {
  const sorted = [...items]
  sorted.sort((a, b) => {
    let cmp = 0
    if (sortBy === 'name') {
      cmp = a.title.localeCompare(b.title, locale, { sensitivity: 'base' })
    } else {
      const timeA = a.lastTravelDate ? new Date(a.lastTravelDate).getTime() : new Date(a.updatedAt).getTime()
      const timeB = b.lastTravelDate ? new Date(b.lastTravelDate).getTime() : new Date(b.updatedAt).getTime()
      cmp = timeA - timeB
    }
    return direction === 'asc' ? cmp : -cmp
  })
  return sorted
}

export default function LogbookDashboard({ onSelectLogbook, onLogout, onOpenProfile, onOpenAdmin }: LogbookDashboardProps) {
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
  const [filterQuery, setFilterQuery] = useState('')
  const [searchFieldsByLogbookId, setSearchFieldsByLogbookId] = useState<Map<string, LogbookSearchFields>>(
    () => new Map()
  )
  const [sortBy, setSortBy] = useState<LogbookSortKey>('date')
  const [sortDirection, setSortDirection] = useState<LogbookSortDirection>('desc')
  const filterInputRef = useRef<HTMLInputElement>(null)
  const [online, setOnline] = useState(navigator.onLine)

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

  useEffect(() => {
    const ids = logbooks.map((lb) => lb.id)
    if (ids.length === 0) {
      setSearchFieldsByLogbookId(new Map())
      return
    }

    let cancelled = false
    void loadLogbookSearchFieldsBatch(ids).then((index) => {
      if (!cancelled) setSearchFieldsByLogbookId(index)
    })

    return () => {
      cancelled = true
    }
  }, [logbooks])

  const loadLogbooks = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchLogbooks()
      setLogbooks(data)
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('errors.load_failed')))
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('errors.save_failed')))
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
        setError(getErrorMessage(err, t('errors.delete_failed')))
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
      setError(getErrorMessage(err, t('errors.save_failed')))
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    void logoutUser()
    onLogout()
  }


  const ownedLogbooks = logbooks.filter((lb) => !lb.isShared)
  const sharedLogbooks = logbooks.filter((lb) => lb.isShared)

  const filterActive = filterQuery.trim().length > 0
  const filteredOwnedLogbooks = useMemo(
    () =>
      ownedLogbooks.filter((lb) =>
        logbookMatchesFilter(lb, filterQuery, i18n.language, searchFieldsByLogbookId.get(lb.id))
      ),
    [ownedLogbooks, filterQuery, i18n.language, searchFieldsByLogbookId]
  )
  const filteredSharedLogbooks = useMemo(
    () =>
      sharedLogbooks.filter((lb) =>
        logbookMatchesFilter(lb, filterQuery, i18n.language, searchFieldsByLogbookId.get(lb.id))
      ),
    [sharedLogbooks, filterQuery, i18n.language, searchFieldsByLogbookId]
  )
  const sortedOwnedLogbooks = useMemo(
    () => sortLogbooks(filteredOwnedLogbooks, sortBy, sortDirection, i18n.language),
    [filteredOwnedLogbooks, sortBy, sortDirection, i18n.language]
  )
  const sortedSharedLogbooks = useMemo(
    () => sortLogbooks(filteredSharedLogbooks, sortBy, sortDirection, i18n.language),
    [filteredSharedLogbooks, sortBy, sortDirection, i18n.language]
  )
  const filteredLogbookCount = sortedOwnedLogbooks.length + sortedSharedLogbooks.length

  const renderLogbookCard = (lb: DecryptedLogbook) => {
    const isEditingTitle = editingLogbookId === lb.id

    return (
    <div
      key={lb.id}
      className={`logbook-card glass${lb.isShared ? ' logbook-card--shared' : ''}${isEditingTitle ? ' logbook-card--editing-title' : ''}`}
    >
      {!isEditingTitle && (
        <button
          type="button"
          className="logbook-card-select"
          onClick={() => onSelectLogbook(lb.id, lb.title)}
          aria-label={t('dashboard.open_logbook', { title: lb.title })}
        />
      )}

      <div className="card-icon" aria-hidden>
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
          <span className="entry-count-badge" title={t('dashboard.travel_days_count', { count: lb.entryCount ?? 0 })}>
            <CalendarDays size={12} style={{ marginRight: '4px' }} />
            {lb.entryCount ?? 0}
          </span>
          <span className="date-badge">
            {new Date(lb.lastTravelDate || lb.updatedAt).toLocaleDateString(i18n.language, {
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

          <ProfileHeaderButton onClick={onOpenProfile} />

          {onOpenAdmin && <AdminHeaderButton onClick={onOpenAdmin} />}

          <LanguageDropdown variant="icon" align="right" />

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
            <>
              <div className="dashboard-list-controls">
                <div className="dashboard-filter-bar">
                  <label className="dashboard-filter-label" htmlFor="logbook-list-filter">
                    {t('dashboard.filter_label')}
                  </label>
                  <div className="dashboard-filter-input-wrap">
                    <Search size={18} className="dashboard-filter-icon" aria-hidden="true" />
                    <input
                      ref={filterInputRef}
                      id="logbook-list-filter"
                      type="search"
                      className="input-text dashboard-filter-input"
                      placeholder={t('dashboard.filter_placeholder')}
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      aria-describedby={filterActive ? 'logbook-filter-status' : undefined}
                    />
                    {filterActive && (
                      <button
                        type="button"
                        className="dashboard-filter-clear"
                        onClick={() => {
                          setFilterQuery('')
                          filterInputRef.current?.focus()
                        }}
                        title={t('dashboard.filter_clear')}
                        aria-label={t('dashboard.filter_clear')}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {filterActive && (
                    <p id="logbook-filter-status" className="dashboard-filter-meta" role="status">
                      {t('dashboard.filter_results', { count: filteredLogbookCount })}
                    </p>
                  )}
                </div>

                <div className="dashboard-sort-bar">
                  <span className="dashboard-sort-label">{t('dashboard.sort_label')}</span>
                  <div className="dashboard-sort-row">
                    <div className="dashboard-sort-group" role="group" aria-label={t('dashboard.sort_by_label')}>
                      <button
                        type="button"
                        className={`dashboard-sort-btn${sortBy === 'name' ? ' is-active' : ''}`}
                        onClick={() => setSortBy('name')}
                        aria-pressed={sortBy === 'name'}
                        aria-label={t('dashboard.sort_by_name')}
                        title={t('dashboard.sort_by_name')}
                      >
                        <CaseSensitive size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`dashboard-sort-btn${sortBy === 'date' ? ' is-active' : ''}`}
                        onClick={() => setSortBy('date')}
                        aria-pressed={sortBy === 'date'}
                        aria-label={t('dashboard.sort_by_date')}
                        title={t('dashboard.sort_by_date')}
                      >
                        <CalendarDays size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="dashboard-sort-group" role="group" aria-label={t('dashboard.sort_dir_label')}>
                      <button
                        type="button"
                        className={`dashboard-sort-btn${sortDirection === 'asc' ? ' is-active' : ''}`}
                        onClick={() => setSortDirection('asc')}
                        aria-pressed={sortDirection === 'asc'}
                        aria-label={sortBy === 'name' ? t('dashboard.sort_name_asc') : t('dashboard.sort_date_asc')}
                        title={sortBy === 'name' ? t('dashboard.sort_name_asc') : t('dashboard.sort_date_asc')}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`dashboard-sort-btn${sortDirection === 'desc' ? ' is-active' : ''}`}
                        onClick={() => setSortDirection('desc')}
                        aria-pressed={sortDirection === 'desc'}
                        aria-label={sortBy === 'name' ? t('dashboard.sort_name_desc') : t('dashboard.sort_date_desc')}
                        title={sortBy === 'name' ? t('dashboard.sort_name_desc') : t('dashboard.sort_date_desc')}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {filterActive && filteredLogbookCount === 0 ? (
                <div className="dashboard-status-msg glass">{t('dashboard.filter_no_results')}</div>
              ) : (
                <div className="logbook-sections">
                  {sortedOwnedLogbooks.length > 0 && renderLogbookSection(
                    sortedSharedLogbooks.length > 0 ? t('dashboard.section_owned') : t('dashboard.title'),
                    sortedOwnedLogbooks
                  )}
                  {sortedSharedLogbooks.length > 0 && renderLogbookSection(
                    t('dashboard.section_shared'),
                    sortedSharedLogbooks,
                    t('dashboard.section_shared_hint')
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
