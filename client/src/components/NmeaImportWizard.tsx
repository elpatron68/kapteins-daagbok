import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FileText, X } from 'lucide-react'
import type { LogEventPayload } from '../utils/logEntryPayload.js'
import { sortLogEventsByTime } from '../utils/logEntryPayload.js'
import { parseNmeaFile, nmeaPointsToWaypoints } from '../services/nmea/nmeaParse.js'
import { filterPointsForDate } from '../services/nmea/nmeaTimeSeries.js'
import { generateNmeaJournalCandidates } from '../services/nmea/nmeaJournalGenerator.js'
import type { NmeaImportMode, NmeaParseResult } from '../services/nmea/nmeaTypes.js'
import { saveNmeaArchive, recordNmeaFileImport, type NmeaArchiveRecord } from '../services/nmeaArchive.js'
import { nmeaFileCrc32 } from '../utils/crc32.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import type { TrackWaypoint } from '../services/trackUpload.js'

interface NmeaImportWizardProps {
  open: boolean
  onClose: () => void
  logbookId: string
  entryId: string
  entryDate: string
  nmeaArchive: NmeaArchiveRecord | null
  onImport: (events: LogEventPayload[], waypoints?: TrackWaypoint[]) => void
}

type WizardStep = 'config' | 'preview' | 'archive'

export default function NmeaImportWizard({
  open,
  onClose,
  logbookId,
  entryId,
  entryDate,
  nmeaArchive,
  onImport
}: NmeaImportWizardProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<WizardStep>('config')
  const [parseResult, setParseResult] = useState<NmeaParseResult | null>(null)
  const [mode, setMode] = useState<NmeaImportMode>('both')
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [importTrack, setImportTrack] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pendingRaw, setPendingRaw] = useState<{ filename: string; text: string } | null>(null)
  const [duplicateFile, setDuplicateFile] = useState(false)

  const filteredPoints = useMemo(() => {
    if (!parseResult) return []
    return filterPointsForDate(parseResult.points, entryDate)
  }, [parseResult, entryDate])

  const candidates = useMemo(() => {
    if (!parseResult || filteredPoints.length === 0) return []
    return generateNmeaJournalCandidates({
      points: filteredPoints,
      mode,
      intervalMinutes,
      t
    }).candidates
  }, [parseResult, filteredPoints, mode, intervalMinutes, t])

  const reset = () => {
    setStep('config')
    setParseResult(null)
    setMode('both')
    setIntervalMinutes(60)
    setImportTrack(true)
    setSelectedIds(new Set())
    setError(null)
    setDuplicateFile(false)
    setPendingRaw(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = (file: File) => {
    setError(null)
    setDuplicateFile(false)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const crc32 = nmeaFileCrc32(text)
        const alreadyImported = nmeaArchive?.importedFiles.some((item) => item.crc32 === crc32) ?? false
        setDuplicateFile(alreadyImported)
        const result = parseNmeaFile(text, file.name)
        if (result.points.length === 0) {
          setError(t('logs.nmea_error_no_samples'))
          return
        }
        setParseResult(result)
        setPendingRaw({ filename: file.name, text })
        const generated = generateNmeaJournalCandidates({
          points: filterPointsForDate(result.points, entryDate),
          mode,
          intervalMinutes,
          t
        }).candidates
        setSelectedIds(new Set(generated.map((c) => c.id)))
      } catch (err) {
        setError(err instanceof Error ? err.message : t('logs.nmea_error_parse'))
      }
    }
    reader.onerror = () => setError(t('logs.nmea_error_read'))
    reader.readAsText(file)
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(candidates.map((c) => c.id)) : new Set())
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const goPreview = () => {
    if (!parseResult) {
      setError(t('logs.nmea_error_no_file'))
      return
    }
    const generated = generateNmeaJournalCandidates({
      points: filteredPoints,
      mode,
      intervalMinutes,
      t
    }).candidates
    setSelectedIds(new Set(generated.map((c) => c.id)))
    setStep('preview')
  }

  const applyImport = async () => {
    const picked = candidates.filter((c) => selectedIds.has(c.id)).map((c) => c.event)
    if (picked.length === 0) {
      setError(t('logs.nmea_error_no_selection'))
      return
    }
    const waypoints = importTrack ? nmeaPointsToWaypoints(filteredPoints) : undefined
    onImport(sortLogEventsByTime(picked), waypoints)
    if (pendingRaw) {
      try {
        await recordNmeaFileImport(logbookId, entryId, pendingRaw.filename, pendingRaw.text)
      } catch (err) {
        console.warn('NMEA import CRC record failed:', err)
      }
    }
    trackPlausibleEvent(PlausibleEvents.NMEA_IMPORTED, {
      mode,
      candidates: picked.length,
      track: importTrack && (waypoints?.length ?? 0) > 0
    })
    setStep('archive')
  }

  const finishArchive = async (archive: boolean) => {
    try {
      if (archive && pendingRaw) {
        await saveNmeaArchive(logbookId, entryId, pendingRaw.filename, pendingRaw.text)
      }
    } catch (err) {
      console.warn('NMEA archive save failed:', err)
    }
    handleClose()
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="disclaimer-modal-overlay" onClick={handleClose}>
      <div className="disclaimer-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="auth-card glass registration-disclaimer registration-disclaimer--modal feedback-modal">
          <button
            type="button"
            className="registration-disclaimer__close feedback-modal__close"
            onClick={handleClose}
            aria-label={t('logs.nmea_cancel')}
          >
            <X size={18} />
          </button>

          <div className="auth-header">
            <FileText className="auth-icon accent" size={40} />
            <h2>{t('logs.nmea_import_title')}</h2>
          </div>

          {error && <div className="track-error-msg">{error}</div>}

          {duplicateFile && (
            <div className="nmea-import-warning" role="status">
              {t('logs.nmea_warn_duplicate_file')}
            </div>
          )}

          {step === 'config' && (
            <>
              <p className="registration-disclaimer__intro">{t('logs.nmea_import_intro')}</p>
              <label className="feedback-form__field">
                <span>{t('logs.nmea_file_label')}</span>
                <input
                  type="file"
                  accept=".nmea,.log,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                  }}
                />
              </label>

              {parseResult && (
                <div className="nmea-import-summary">
                  <p>{t('logs.nmea_stats', {
                    lines: parseResult.stats.parsedLines,
                    types: parseResult.stats.sentenceTypes.join(', ')
                  })}</p>
                  {parseResult.warnings.includes('no_position') && (
                    <p>{t('logs.nmea_warn_no_position')}</p>
                  )}
                </div>
              )}

              <fieldset className="nmea-import-mode">
                <legend>{t('logs.nmea_mode_label')}</legend>
                <label><input type="radio" name="nmea-mode" checked={mode === 'interval'} onChange={() => setMode('interval')} /> {t('logs.nmea_mode_interval')}</label>
                <label><input type="radio" name="nmea-mode" checked={mode === 'change'} onChange={() => setMode('change')} /> {t('logs.nmea_mode_change')}</label>
                <label><input type="radio" name="nmea-mode" checked={mode === 'both'} onChange={() => setMode('both')} /> {t('logs.nmea_mode_both')}</label>
              </fieldset>

              {(mode === 'interval' || mode === 'both') && (
                <label className="feedback-form__field">
                  <span>{t('logs.nmea_interval_label')}</span>
                  <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
                    <option value={30}>30 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
                </label>
              )}

              <label className="nmea-import-checkbox">
                <input type="checkbox" checked={importTrack} onChange={(e) => setImportTrack(e.target.checked)} />
                {t('logs.nmea_import_track')}
              </label>

              <div className="auth-actions feedback-form__actions">
                <button type="button" className="btn secondary" onClick={handleClose}>{t('logs.nmea_cancel')}</button>
                <button type="button" className="btn primary" onClick={goPreview} disabled={!parseResult}>
                  {t('logs.nmea_preview')}
                </button>
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              <p>{t('logs.nmea_preview_hint', { count: candidates.length })}</p>
              <div className="nmea-preview-actions">
                <button type="button" className="btn secondary" onClick={() => toggleAll(true)}>{t('logs.nmea_select_all')}</button>
                <button type="button" className="btn secondary" onClick={() => toggleAll(false)}>{t('logs.nmea_select_none')}</button>
              </div>
              <div className="nmea-preview-list">
                {candidates.map((c) => (
                  <label key={c.id} className="nmea-preview-row">
                    <input
                      type="checkbox"
                      className="nmea-preview-row__check"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                    />
                    <div className="nmea-preview-row__body">
                      <div className="nmea-preview-row__meta">
                        <span className="nmea-preview-time">{c.event.time}</span>
                        <span className="nmea-preview-source">{t(`logs.nmea_source_${c.source}`)}</span>
                      </div>
                      <span className="nmea-preview-remarks">{c.event.remarks || c.event.mgk || '—'}</span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="auth-actions feedback-form__actions">
                <button type="button" className="btn secondary" onClick={() => setStep('config')}>{t('logs.nmea_back')}</button>
                <button type="button" className="btn primary" onClick={applyImport}>{t('logs.nmea_apply')}</button>
              </div>
            </>
          )}

          {step === 'archive' && (
            <>
              <p>{t('logs.nmea_archive_question')}</p>
              <div className="auth-actions feedback-form__actions">
                <button type="button" className="btn secondary" onClick={() => finishArchive(false)}>
                  {t('logs.nmea_archive_discard')}
                </button>
                <button type="button" className="btn primary" onClick={() => finishArchive(true)}>
                  {t('logs.nmea_archive_keep')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
