import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { encryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { getErrorMessage } from '../utils/errors.js'
import { findTodayEntryId, pruneEmptyTodayDuplicates, tryDecryptEntryPayload } from '../services/quickEventLog.js'
import { localDateString } from '../utils/logEntryPayload.js'
import {
  getLogsViewModePreference,
  setLogsViewModePreference,
  getActiveUserId
} from '../services/userPreferences.js'
import { useLogExport } from '../hooks/useLogExport.js'
import LogEntryEditor from './LogEntryEditor.tsx'
import LiveLogView, { type LiveEntrySummary } from './LiveLogView.tsx'
import EntrySkipperSignBadge from './EntrySkipperSignBadge.tsx'
import { useDialog } from './ModalDialog.tsx'
import { getSkipperSignStatus, type SkipperSignStatus } from '../utils/signatures.js'
import {
  buildEntryListCache,
  entryListItemFromLocal,
  putEntryRecord
} from '../utils/entryListCache.js'
import { forEachInBatches } from '../utils/yieldToMain.js'
import { FileText, Plus, Trash2, ChevronRight, Calendar, Download, Share2, Radio, ChevronLeft } from 'lucide-react'
import {
  carryOverFromPreviousDay,
  compareTravelDaysChronological,
  emptyTankLevels,
  formatTankLiters,
  getNextTravelDayNumber,
  hasCarryOverFromPreviousDay,
  type LogEntryTankSource,
  type TravelDaySortable
} from '../utils/logEntryTankLevels.js'

interface LogEntriesListProps {
  logbookId: string
  readOnly?: boolean
  preloadedYacht?: any
  preloadedEntries?: any[]
  preloadedPhotos?: any[]
  preloadedVoiceMemos?: import('./VoiceMemoPlayer.tsx').PreloadedVoiceMemo[]
  preloadedGpsTracks?: any[]
  controlledSelectedEntryId?: string | null
  onSelectedEntryIdChange?: (id: string | null) => void
  highlightEntryId?: string | null
}

type LogsViewMode = 'list' | 'live'

interface DecryptedEntryItem {
  id: string
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  updatedAt: string
  skipperSignStatus: SkipperSignStatus
}

export default function LogEntriesList({
  logbookId,
  readOnly = false,
  preloadedYacht,
  preloadedEntries,
  preloadedPhotos,
  preloadedVoiceMemos,
  preloadedGpsTracks,
  controlledSelectedEntryId,
  onSelectedEntryIdChange,
  highlightEntryId
}: LogEntriesListProps) {
  const { t } = useTranslation()
  const { showConfirm } = useDialog()
  const [entries, setEntries] = useState<DecryptedEntryItem[]>([])
  const [internalSelectedEntryId, setInternalSelectedEntryId] = useState<string | null>(null)
  const isEntrySelectionControlled = onSelectedEntryIdChange !== undefined
  const selectedEntryId = isEntrySelectionControlled
    ? (controlledSelectedEntryId ?? null)
    : internalSelectedEntryId
  const setSelectedEntryId = (entryId: string | null) => {
    if (isEntrySelectionControlled) {
      onSelectedEntryIdChange?.(entryId)
    } else {
      setInternalSelectedEntryId(entryId)
    }
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewModeState] = useState<LogsViewMode>(() =>
    readOnly ? 'list' : getLogsViewModePreference(getActiveUserId())
  )
  const [liveSelectedEntryId, setLiveSelectedEntryId] = useState<string | null>(null)
  const [todayEntryId, setTodayEntryId] = useState<string | null>(null)
  const [returnToLiveAfterEditor, setReturnToLiveAfterEditor] = useState(false)
  const prevSelectedEntryIdRef = useRef<string | null | undefined>(undefined)

  const setViewMode = useCallback((mode: LogsViewMode) => {
    setViewModeState(mode)
    if (!readOnly) {
      const userId = getActiveUserId()
      if (userId) setLogsViewModePreference(userId, mode)
    }
  }, [readOnly])

  const {
    exporting: exportBusy,
    error: exportError,
    handleDownloadCsv,
    handleShareCsv,
    handleDownloadPdf,
    handleDownloadPhotosZip,
    canExportPhotosZip
  } = useLogExport({
    logbookId,
    entries,
    readOnly,
    preloadedYacht,
    preloadedEntries
  })

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (readOnly && preloadedEntries) {
        const list: DecryptedEntryItem[] = []
        for (const entry of preloadedEntries) {
          list.push({
            id: entry.payloadId || entry.id,
            date: entry.date || '',
            dayOfTravel: entry.dayOfTravel || '',
            departure: entry.departure || '',
            destination: entry.destination || '',
            updatedAt: entry.updatedAt || new Date().toISOString(),
            skipperSignStatus: await getSkipperSignStatus(entry)
          })
        }

        list.sort((a, b) => {
          const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime()
          if (dateCompare !== 0) return dateCompare
          return Number(b.dayOfTravel) - Number(a.dayOfTravel)
        })

        setEntries(list)
        return
      }

      const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
      if (!masterKey) throw new Error('Encryption key not found. Please log in.')

      const todayId = await findTodayEntryId(logbookId)
      setTodayEntryId(todayId)
      if (todayId) {
        await pruneEmptyTodayDuplicates(logbookId, todayId)
      }

      const local = await db.entries.where({ logbookId }).toArray()

      const list: DecryptedEntryItem[] = []
      const needsDecrypt: typeof local = []

      for (const entry of local) {
        const cached = entryListItemFromLocal(entry)
        if (cached) {
          list.push(cached)
        } else {
          needsDecrypt.push(entry)
        }
      }

      await forEachInBatches(needsDecrypt, 8, async (entry) => {
        const decrypted = await tryDecryptEntryPayload(entry, masterKey)
        if (!decrypted) return

        const listCache = await buildEntryListCache(decrypted as Record<string, unknown>)
        list.push({
          id: entry.payloadId,
          ...listCache,
          updatedAt: entry.updatedAt
        })
        void db.entries.update(entry.payloadId, { listCache }).catch((err) => {
          console.warn('Failed to persist entry list cache:', err)
        })
      })

      // Sort chronological descending (by date, or dayOfTravel numerical)
      list.sort((a, b) => {
        const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime()
        if (dateCompare !== 0) return dateCompare
        return Number(b.dayOfTravel) - Number(a.dayOfTravel)
      })

      setEntries(list)
    } catch (err: any) {
      console.error('Failed to load log entries:', err)
      setError(getErrorMessage(err, t('errors.load_failed')))
    } finally {
      setLoading(false)
    }
  }, [logbookId, readOnly, preloadedEntries])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  useEffect(() => {
    if (viewMode === 'live') return
    const prevSelectedEntryId = prevSelectedEntryIdRef.current
    prevSelectedEntryIdRef.current = selectedEntryId

    if (prevSelectedEntryId !== undefined && prevSelectedEntryId !== null && selectedEntryId === null) {
      loadEntries()
    }
  }, [selectedEntryId, loadEntries, viewMode])

  const handleCreate = async () => {
    if (readOnly) return
    setError(null)
    try {
      const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
      if (!masterKey) throw new Error('Encryption key not found. Please log in.')

      const existingTodayId = await findTodayEntryId(logbookId)
      if (existingTodayId) {
        setSelectedEntryId(existingTodayId)
        return
      }

      const localEntries = await db.entries.where({ logbookId }).toArray()
      const decryptedEntries: Array<LogEntryTankSource & TravelDaySortable> = []

      for (const entry of localEntries) {
        const decrypted = await tryDecryptEntryPayload(entry, masterKey)
        if (decrypted) decryptedEntries.push(decrypted as LogEntryTankSource & TravelDaySortable)
      }

      decryptedEntries.sort(compareTravelDaysChronological)
      const previousEntry = decryptedEntries.at(-1) ?? null
      let { freshwater, fuel, greywaterLevel, departure } = carryOverFromPreviousDay(previousEntry)

      if (previousEntry && hasCarryOverFromPreviousDay({ freshwater, fuel, greywaterLevel, departure })) {
        const confirmed = await showConfirm(
          t('logs.carry_over_tanks_confirm', {
            departure: departure || '—',
            fw: formatTankLiters(freshwater.morning),
            fuel: formatTankLiters(fuel.morning),
            greywater: formatTankLiters(greywaterLevel)
          }),
          t('logs.carry_over_tanks_title'),
          t('logs.carry_over_tanks_yes'),
          t('logs.carry_over_tanks_no')
        )
        if (!confirmed) {
          freshwater = emptyTankLevels()
          fuel = emptyTankLevels()
          greywaterLevel = 0
          departure = ''
        }
      }

      setLoading(true)

      const localId = window.crypto.randomUUID()
      const nowStr = new Date().toISOString()
      const todayStr = localDateString()

      const { loadDefaultEntryCrewForNewDay } = await import('./EntryCrewSection.js')
      const entryCrew = await loadDefaultEntryCrewForNewDay(
        logbookId,
        previousEntry as Record<string, unknown> | null
      )

      const initialPayload = {
        date: todayStr,
        dayOfTravel: getNextTravelDayNumber(decryptedEntries),
        departure,
        destination: '',
        freshwater,
        fuel,
        ...(greywaterLevel > 0 ? { greywater: { level: greywaterLevel } } : {}),
        selectedSkipperId: entryCrew.selectedSkipperId,
        selectedCrewIds: entryCrew.selectedCrewIds,
        crewSnapshotsById: entryCrew.crewSnapshotsById,
        signSkipper: '',
        signCrew: '',
        events: []
      }

      const encrypted = await encryptJson(initialPayload, masterKey)

      // Save locally
      await putEntryRecord(
        {
          payloadId: localId,
          logbookId,
          encryptedData: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          updatedAt: nowStr
        },
        initialPayload
      )

      // Queue for background sync
      await db.syncQueue.put({
        action: 'create',
        type: 'entry',
        payloadId: localId,
        logbookId,
        data: JSON.stringify(encrypted),
        updatedAt: nowStr
      })

      // Open immediately in details editor
      setSelectedEntryId(localId)
      trackPlausibleEvent(PlausibleEvents.TRAVEL_DAY_CREATED)
      syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
    } catch (err: any) {
      console.error('Failed to create entry:', err)
      setError(getErrorMessage(err, t('errors.save_failed')))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteEntry = async (entryId: string) => {
    if (readOnly) return
    if (await showConfirm(t('logs.delete_confirm'), t('logs.delete_entry'), t('logs.confirm_yes'), t('logs.confirm_no'))) {
      setError(null)
      try {
        const now = new Date().toISOString()
        await db.entries.delete(entryId)
        await db.syncQueue.put({
          action: 'delete',
          type: 'entry',
          payloadId: entryId,
          logbookId,
          data: '',
          updatedAt: now
        })
        setEntries((prev) => prev.filter((item) => item.id !== entryId))
        if (liveSelectedEntryId === entryId) {
          setLiveSelectedEntryId(null)
        }
        syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
      } catch (err: unknown) {
        console.error('Failed to delete log entry:', err)
        setError(getErrorMessage(err, t('errors.delete_failed')))
      }
    }
  }

  const handleDelete = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await handleDeleteEntry(entryId)
  }

  const entrySummaries: LiveEntrySummary[] = entries.map((e) => ({
    id: e.id,
    date: e.date,
    dayOfTravel: e.dayOfTravel,
    departure: e.departure,
    destination: e.destination
  }))

  const combinedError = error || exportError

  if (selectedEntryId) {
    return (
      <LogEntryEditor
        entryId={selectedEntryId}
        logbookId={logbookId}
        onBack={() => {
          setSelectedEntryId(null)
          if (returnToLiveAfterEditor) {
            setViewMode('live')
            setReturnToLiveAfterEditor(false)
          }
        }}
        readOnly={readOnly}
        preloadedEntry={preloadedEntries?.find(entry => (entry.payloadId || entry.id) === selectedEntryId)}
        preloadedPhotos={preloadedPhotos}
        preloadedVoiceMemos={preloadedVoiceMemos}
        preloadedTrack={preloadedGpsTracks?.find(track => track.entryId === selectedEntryId)}
      />
    )
  }

  if (viewMode === 'live' && !readOnly) {
    return (
      <>
        {combinedError && <div className="auth-error mb-4" style={{ margin: '0 0 12px' }}>{combinedError}</div>}
        <LiveLogView
          logbookId={logbookId}
          selectedEntryId={liveSelectedEntryId}
          entrySummaries={entrySummaries}
          todayEntryId={todayEntryId}
          onEntryChange={setLiveSelectedEntryId}
          onOpenEditor={(entryId) => {
            setReturnToLiveAfterEditor(true)
            setSelectedEntryId(entryId)
          }}
          onOpenAllDays={() => {
            setViewMode('list')
            void loadEntries()
          }}
          onDeleteEntry={handleDeleteEntry}
          onDownloadCsv={() => void handleDownloadCsv()}
          onShareCsv={() => void handleShareCsv()}
          onDownloadPhotosZip={() => void handleDownloadPhotosZip()}
          onDownloadPdf={(entryId, date) => void handleDownloadPdf(entryId, date)}
          exporting={exportBusy}
          canExportPhotosZip={canExportPhotosZip}
          hasLogbookEntries={entries.length > 0}
        />
      </>
    )
  }

  if (loading) {
    return (
      <div className="tab-placeholder">
        <FileText className="header-logo spin" size={48} />
        <p>{t('logs.loading')}</p>
      </div>
    )
  }

  const tourFirstEntryId =
    highlightEntryId && entries.some((e) => e.id === highlightEntryId)
      ? highlightEntryId
      : entries[0]?.id ?? null

  return (
    <div className="logs-journal">
      <div className="section-title-bar mb-6">
        <div className="form-header" style={{ margin: 0 }}>
          <Calendar size={24} className="form-icon" />
          <h2>{t('logs.title')}</h2>
        </div>
        <div className="section-toolbar">
          {!readOnly && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => setViewMode('live')}
              style={{ width: 'auto', padding: '8px 16px' }}
              title={t('logs.live_mode')}
            >
              <ChevronLeft size={16} />
              <Radio size={16} />
              <span className="hide-mobile">{t('logs.back_to_live')}</span>
            </button>
          )}

          <button className="btn secondary" onClick={() => void handleDownloadCsv()} disabled={loading || exportBusy || entries.length === 0} style={{ width: 'auto', padding: '8px 16px' }} title={t('logs.export_csv')}>
            <Download size={16} />
            <span className="hide-mobile">{exportBusy ? t('logs.exporting') : t('logs.export_csv')}</span>
          </button>
          
          <button className="btn secondary" onClick={() => void handleShareCsv()} disabled={loading || exportBusy || entries.length === 0} style={{ width: 'auto', padding: '8px 16px' }} title={t('logs.share_csv')}>
            <Share2 size={16} />
            <span className="hide-mobile">{t('logs.share_csv')}</span>
          </button>

          {canExportPhotosZip && (
            <button
              className="btn secondary"
              onClick={() => void handleDownloadPhotosZip()}
              disabled={loading || exportBusy || entries.length === 0}
              style={{ width: 'auto', padding: '8px 16px' }}
              title={t('logs.export_photos_zip')}
            >
              <Download size={16} />
              <span className="hide-mobile">
                {exportBusy ? t('logs.exporting_photos_zip') : t('logs.export_photos_zip')}
              </span>
            </button>
          )}

          {!readOnly && (
            <button className="btn primary" onClick={handleCreate} disabled={loading || exportBusy} style={{ width: 'auto', padding: '8px 16px' }} title={t('logs.new_entry')}>
              <Plus size={16} />
              <span className="hide-mobile">{t('logs.new_entry')}</span>
            </button>
          )}
        </div>
      </div>

      {combinedError && <div className="auth-error mb-4">{combinedError}</div>}

      {entries.length === 0 ? (
        <div className="dashboard-status-msg">{t('logs.no_entries')}</div>
      ) : (
        <div className="logbooks-grid" data-tour="entry-list">
          {entries.map((item) => (
            <div
              key={item.id}
              className="logbook-card glass"
              data-tour={tourFirstEntryId === item.id ? 'entry-first' : undefined}
            >
              <button
                type="button"
                className="logbook-card-select"
                onClick={() => {
                  if (readOnly) {
                    setSelectedEntryId(item.id)
                  } else {
                    setLiveSelectedEntryId(item.id)
                    setViewMode('live')
                  }
                }}
                aria-label={
                  item.departure && item.destination
                    ? `${item.departure} → ${item.destination}, ${t('logs.travel_day_number', { number: item.dayOfTravel })}`
                    : `${t('logs.new_entry')}, ${t('logs.travel_day_number', { number: item.dayOfTravel })}`
                }
              />

              <div className="card-icon" aria-hidden>
                <FileText size={24} />
              </div>

              <div className="card-info">
                <h3 style={{ textTransform: 'capitalize' }}>
                  {item.departure && item.destination
                    ? `${item.departure} → ${item.destination}`
                    : t('logs.new_entry')}
                </h3>
                <div className="card-meta">
                  <span className="sync-badge synced">
                    {t('logs.travel_day_number', { number: item.dayOfTravel })}
                  </span>
                  <EntrySkipperSignBadge status={item.skipperSignStatus} />
                  <span className="date-badge">
                    {new Date(item.date).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="logbook-card-right-group">
                <button className="btn-pdf" onClick={(e) => { e.stopPropagation(); void handleDownloadPdf(item.id, item.date) }} title={t('logs.export_pdf')} disabled={exportBusy}>
                  <Download size={18} />
                </button>
                {!readOnly && (
                  <button className="btn-delete" onClick={(e) => handleDelete(item.id, e)} title={t('logs.delete_entry')}>
                    <Trash2 size={18} />
                  </button>
                )}
                <ChevronRight size={18} className="logbook-card-chevron" aria-hidden />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
