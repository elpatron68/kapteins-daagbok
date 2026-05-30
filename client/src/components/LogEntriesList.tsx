import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson, encryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { downloadCsv, shareCsv } from '../services/csvExport.js'
import { downloadLogbookPagePdf } from '../services/pdfExport.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import LogEntryEditor from './LogEntryEditor.tsx'
import EntrySkipperSignBadge from './EntrySkipperSignBadge.tsx'
import { useDialog } from './ModalDialog.tsx'
import { getSkipperSignStatus, type SkipperSignStatus } from '../utils/signatures.js'
import { FileText, Plus, Trash2, ChevronRight, Calendar, Download, Share2 } from 'lucide-react'
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
  preloadedGpsTracks?: any[]
  controlledSelectedEntryId?: string | null
  onSelectedEntryIdChange?: (id: string | null) => void
  highlightEntryId?: string | null
}

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
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevSelectedEntryIdRef = useRef<string | null | undefined>(undefined)

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

      const local = await db.entries.where({ logbookId }).toArray()
      
      const list: DecryptedEntryItem[] = []
      
      for (const entry of local) {
        const decrypted = await decryptJson(entry.encryptedData, entry.iv, entry.tag, masterKey)
        if (decrypted) {
          list.push({
            id: entry.payloadId,
            date: decrypted.date || '',
            dayOfTravel: decrypted.dayOfTravel || '',
            departure: decrypted.departure || '',
            destination: decrypted.destination || '',
            updatedAt: entry.updatedAt,
            skipperSignStatus: await getSkipperSignStatus(decrypted as Record<string, unknown>)
          })
        }
      }

      // Sort chronological descending (by date, or dayOfTravel numerical)
      list.sort((a, b) => {
        const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime()
        if (dateCompare !== 0) return dateCompare
        return Number(b.dayOfTravel) - Number(a.dayOfTravel)
      })

      setEntries(list)
    } catch (err: any) {
      console.error('Failed to load log entries:', err)
      setError(err.message || 'Decryption failed. Could not load journal list.')
    } finally {
      setLoading(false)
    }
  }, [logbookId, readOnly, preloadedEntries])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  useEffect(() => {
    const prevSelectedEntryId = prevSelectedEntryIdRef.current
    prevSelectedEntryIdRef.current = selectedEntryId

    if (prevSelectedEntryId !== undefined && prevSelectedEntryId !== null && selectedEntryId === null) {
      loadEntries()
    }
  }, [selectedEntryId, loadEntries])

  const handleDownloadCsv = async () => {
    setExporting(true)
    setError(null)
    try {
      const title = preloadedYacht?.name || localStorage.getItem('active_logbook_title') || 'Logbook'
      if (readOnly && preloadedEntries && preloadedYacht) {
        await downloadCsv(logbookId, title, { yacht: preloadedYacht, entries: preloadedEntries })
      } else {
        await downloadCsv(logbookId, title)
      }
      trackPlausibleEvent(PlausibleEvents.CSV_EXPORTED)
    } catch (err: any) {
      console.error('Failed to download CSV:', err)
      setError(err.message || 'Failed to generate CSV export.')
    } finally {
      setExporting(false)
    }
  }

  const handleShareCsv = async () => {
    setExporting(true)
    setError(null)
    try {
      const title = preloadedYacht?.name || localStorage.getItem('active_logbook_title') || 'Logbook'
      if (readOnly && preloadedEntries && preloadedYacht) {
        await shareCsv(logbookId, title, { yacht: preloadedYacht, entries: preloadedEntries })
      } else {
        await shareCsv(logbookId, title)
      }
      trackPlausibleEvent(PlausibleEvents.CSV_SHARED)
    } catch (err: any) {
      if (err.message === 'share_unsupported') {
        const title = preloadedYacht?.name || localStorage.getItem('active_logbook_title') || 'Logbook'
        if (readOnly && preloadedEntries && preloadedYacht) {
          await downloadCsv(logbookId, title, { yacht: preloadedYacht, entries: preloadedEntries })
        } else {
          await downloadCsv(logbookId, title)
        }
        setError(t('logs.share_unsupported'))
      } else {
        console.error('Failed to share CSV:', err)
        setError(err.message || 'Failed to share CSV export.')
      }
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadPdf = async (entryId: string, date: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExporting(true)
    setError(null)
    try {
      if (readOnly && preloadedEntries && preloadedYacht) {
        const fullEntry = preloadedEntries.find(entry => (entry.payloadId || entry.id) === entryId)
        await downloadLogbookPagePdf(logbookId, entryId, date, { yacht: preloadedYacht, entry: fullEntry })
      } else {
        await downloadLogbookPagePdf(logbookId, entryId, date)
      }
      trackPlausibleEvent(PlausibleEvents.PDF_EXPORTED, { scope: 'entry' })
    } catch (err: any) {
      console.error('Failed to download PDF:', err)
      setError(err.message || 'Failed to generate PDF export.')
    } finally {
      setExporting(false)
    }
  }

  const handleCreate = async () => {
    if (readOnly) return
    setError(null)
    try {
      const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
      if (!masterKey) throw new Error('Encryption key not found. Please log in.')

      const localEntries = await db.entries.where({ logbookId }).toArray()
      const decryptedEntries: Array<LogEntryTankSource & TravelDaySortable> = []

      for (const entry of localEntries) {
        const decrypted = await decryptJson(entry.encryptedData, entry.iv, entry.tag, masterKey)
        if (decrypted) decryptedEntries.push(decrypted as LogEntryTankSource & TravelDaySortable)
      }

      decryptedEntries.sort(compareTravelDaysChronological)
      const previousEntry = decryptedEntries.at(-1) ?? null
      let { freshwater, fuel, departure } = carryOverFromPreviousDay(previousEntry)

      if (previousEntry && hasCarryOverFromPreviousDay({ freshwater, fuel, departure })) {
        const confirmed = await showConfirm(
          t('logs.carry_over_tanks_confirm', {
            departure: departure || '—',
            fw: formatTankLiters(freshwater.morning),
            fuel: formatTankLiters(fuel.morning)
          }),
          t('logs.carry_over_tanks_title'),
          t('logs.carry_over_tanks_yes'),
          t('logs.carry_over_tanks_no')
        )
        if (!confirmed) {
          freshwater = emptyTankLevels()
          fuel = emptyTankLevels()
          departure = ''
        }
      }

      setLoading(true)

      const localId = window.crypto.randomUUID()
      const nowStr = new Date().toISOString()
      const todayStr = nowStr.substring(0, 10)

      const initialPayload = {
        date: todayStr,
        dayOfTravel: getNextTravelDayNumber(decryptedEntries),
        departure,
        destination: '',
        freshwater,
        fuel,
        signSkipper: '',
        signCrew: '',
        events: []
      }

      const encrypted = await encryptJson(initialPayload, masterKey)

      // Save locally
      await db.entries.put({
        payloadId: localId,
        logbookId,
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: nowStr
      })

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
      setError(err.message || 'Failed to create new log entry.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation()
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
        syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
      } catch (err: any) {
        console.error('Failed to delete log entry:', err)
        setError(err.message || 'Failed to delete log entry.')
      }
    }
  }

  if (selectedEntryId) {
    return (
      <LogEntryEditor
        entryId={selectedEntryId}
        logbookId={logbookId}
        onBack={() => setSelectedEntryId(null)}
        readOnly={readOnly}
        preloadedEntry={preloadedEntries?.find(entry => (entry.payloadId || entry.id) === selectedEntryId)}
        preloadedPhotos={preloadedPhotos}
        preloadedTrack={preloadedGpsTracks?.find(track => track.entryId === selectedEntryId)}
      />
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

  return (
    <div className="form-card">
      <div className="section-title-bar mb-6">
        <div className="form-header" style={{ margin: 0 }}>
          <Calendar size={24} className="form-icon" />
          <h2>{t('logs.title')}</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn secondary" onClick={handleDownloadCsv} disabled={loading || exporting || entries.length === 0} style={{ width: 'auto', padding: '8px 16px' }} title={t('logs.export_csv')}>
            <Download size={16} />
            <span className="hide-mobile">{exporting ? t('logs.exporting') : t('logs.export_csv')}</span>
          </button>
          
          <button className="btn secondary" onClick={handleShareCsv} disabled={loading || exporting || entries.length === 0} style={{ width: 'auto', padding: '8px 16px' }} title={t('logs.share_csv')}>
            <Share2 size={16} />
            <span className="hide-mobile">{t('logs.share_csv')}</span>
          </button>

          {!readOnly && (
            <button className="btn primary" onClick={handleCreate} disabled={loading || exporting} style={{ width: 'auto', padding: '8px 16px' }}>
              <Plus size={16} />
              {t('logs.new_entry')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="auth-error mb-4">{error}</div>}

      {entries.length === 0 ? (
        <div className="dashboard-status-msg">{t('logs.no_entries')}</div>
      ) : (
        <div className="logbooks-grid" data-tour="entry-list">
          {entries.map((item) => (
            <div
              key={item.id}
              className="logbook-card glass"
              data-tour={highlightEntryId === item.id ? 'entry-first' : undefined}
              onClick={() => setSelectedEntryId(item.id)}
            >
              <div className="card-icon">
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
                    {t('logs.day_of_travel')} {item.dayOfTravel}
                  </span>
                  <EntrySkipperSignBadge status={item.skipperSignStatus} />
                  <span className="date-badge">
                    {new Date(item.date).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <button className="btn-pdf" onClick={(e) => handleDownloadPdf(item.id, item.date, e)} title={t('logs.export_pdf')} disabled={exporting}>
                <Download size={18} />
              </button>

              {!readOnly && (
                <button className="btn-delete" onClick={(e) => handleDelete(item.id, e)} title={t('logs.delete_entry')}>
                  <Trash2 size={18} />
                </button>
              )}
              
              <ChevronRight size={18} style={{ color: '#475569', marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
