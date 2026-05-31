import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Anchor,
  ChevronLeft,
  FileText,
  MapPin,
  MessageSquare,
  Radio,
  Sailboat,
  Zap
} from 'lucide-react'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson } from '../services/crypto.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import {
  appendQuickEvent,
  findOrCreateTodayEntry,
  loadEntry
} from '../services/quickEventLog.js'
import { formatEventSummary } from '../utils/formatEventSummary.js'
import {
  isMotorRunningFromEvents,
  LIVE_EVENT_CODES,
  liveCommentRemark,
  liveSailsRemark
} from '../utils/liveEventCodes.js'
import { getCurrentPosition } from '../utils/geolocation.js'
import { sortLogEventsByTime, type LogEventPayload } from '../utils/logEntryPayload.js'
import { useDialog } from './ModalDialog.tsx'

interface LiveLogViewProps {
  logbookId: string
  onOpenEditor: (entryId: string) => void
  onSwitchToList: () => void
}

type LiveModal = 'none' | 'sails' | 'comment'

function hapticPulse() {
  navigator.vibrate?.(40)
}

export default function LiveLogView({
  logbookId,
  onOpenEditor,
  onSwitchToList
}: LiveLogViewProps) {
  const { t, i18n } = useTranslation()
  const { showAlert } = useDialog()

  const [entryId, setEntryId] = useState<string | null>(null)
  const [dayOfTravel, setDayOfTravel] = useState('')
  const [date, setDate] = useState('')
  const [events, setEvents] = useState<LogEventPayload[]>([])
  const [yachtSails, setYachtSails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<LiveModal>('none')
  const [commentText, setCommentText] = useState('')
  const [selectedSails, setSelectedSails] = useState<string[]>([])

  const streamEndRef = useRef<HTMLDivElement | null>(null)

  const defaultSails = i18n.language === 'de'
    ? ['Großsegel', 'Genua', 'Fock', 'Spinnaker', 'Gennaker']
    : ['Mainsail', 'Genoa', 'Jib', 'Spinnaker', 'Gennaker']
  const sailOptions = yachtSails.length > 0 ? yachtSails : defaultSails
  const motorRunning = isMotorRunningFromEvents(events)
  const motorLabel = t('logs.motor_propulsion')

  const refreshEntry = useCallback(async (id: string) => {
    const loaded = await loadEntry(logbookId, id)
    if (!loaded) return
    const entryEvents = (loaded.data.events as LogEventPayload[]) || []
    setDayOfTravel(String(loaded.data.dayOfTravel || ''))
    setDate(String(loaded.data.date || ''))
    setEvents(sortLogEventsByTime(entryEvents.map((e) => ({ ...e }))))
  }, [logbookId])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setError(null)
      try {
        const id = await findOrCreateTodayEntry(logbookId)
        if (cancelled) return
        setEntryId(id)

        const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
        if (masterKey) {
          const yacht = await db.yachts.get(logbookId)
          if (yacht) {
            const decrypted = await decryptJson(yacht.encryptedData, yacht.iv, yacht.tag, masterKey)
            if (decrypted?.sails && Array.isArray(decrypted.sails)) {
              setYachtSails(decrypted.sails as string[])
            }
          }
        }

        await refreshEntry(id)
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to init live log:', err)
          setError(err instanceof Error ? err.message : t('logs.live_load_error'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void init()
    return () => { cancelled = true }
  }, [logbookId, refreshEntry, t])

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const runQuickAction = async (
    action: () => Promise<void>,
    trackEvent?: string
  ) => {
    if (!entryId || busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      await refreshEntry(entryId)
      if (trackEvent) trackPlausibleEvent(PlausibleEvents.TRAVEL_DAY_SAVED, { context: trackEvent })
    } catch (err: unknown) {
      console.error('Live log action failed:', err)
      setError(err instanceof Error ? err.message : t('logs.live_action_error'))
    } finally {
      setBusy(false)
    }
  }

  const handleMotorToggle = () => {
    hapticPulse()
    void runQuickAction(async () => {
      if (!entryId) return
      const starting = !motorRunning
      await appendQuickEvent(logbookId, entryId, {
        sailsOrMotor: starting ? motorLabel : '',
        remarks: starting ? LIVE_EVENT_CODES.MOTOR_START : LIVE_EVENT_CODES.MOTOR_STOP
      })
    }, 'live_motor')
  }

  const handleCastOff = () => {
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, {
        remarks: LIVE_EVENT_CODES.CAST_OFF
      })
    }, 'live_cast_off')
  }

  const handleMoor = () => {
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, {
        remarks: LIVE_EVENT_CODES.MOOR
      })
    }, 'live_moor')
  }

  const handleFix = () => {
    void runQuickAction(async () => {
      if (!entryId) return
      try {
        const coords = await getCurrentPosition()
        await appendQuickEvent(logbookId, entryId, {
          gpsLat: coords.lat,
          gpsLng: coords.lng,
          remarks: LIVE_EVENT_CODES.FIX
        })
      } catch {
        await showAlert(t('logs.live_gps_error'), t('logs.live_fix'))
      }
    }, 'live_fix')
  }

  const toggleSailSelection = (sail: string) => {
    setSelectedSails((prev) =>
      prev.some((s) => s.toLowerCase() === sail.toLowerCase())
        ? prev.filter((s) => s.toLowerCase() !== sail.toLowerCase())
        : [...prev, sail]
    )
  }

  const confirmSails = () => {
    if (selectedSails.length === 0) {
      setModal('none')
      return
    }
    const sailsLabel = selectedSails.join(' + ')
    setModal('none')
    setSelectedSails([])
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, {
        sailsOrMotor: sailsLabel,
        remarks: liveSailsRemark(sailsLabel)
      })
    }, 'live_sails')
  }

  const confirmComment = () => {
    const text = commentText.trim()
    if (!text) {
      setModal('none')
      return
    }
    setModal('none')
    setCommentText('')
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, {
        remarks: liveCommentRemark(text)
      })
    }, 'live_comment')
  }

  if (loading) {
    return (
      <div className="tab-placeholder">
        <Radio className="header-logo spin" size={48} />
        <p>{t('logs.live_loading')}</p>
      </div>
    )
  }

  return (
    <div className="form-card live-log-card">
      <div className="section-title-bar mb-4">
        <div className="form-header" style={{ margin: 0 }}>
          <Radio size={24} className="form-icon" />
          <div>
            <h2>{t('logs.live_title')}</h2>
            {date && (
              <p className="live-log-subtitle">
                {t('logs.day_of_travel')} {dayOfTravel} · {new Date(date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <div className="section-toolbar">
          <button
            type="button"
            className="btn secondary"
            onClick={onSwitchToList}
            style={{ width: 'auto', padding: '8px 16px' }}
          >
            <ChevronLeft size={16} />
            <span className="hide-mobile">{t('logs.view_list')}</span>
          </button>
          {entryId && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => onOpenEditor(entryId)}
              style={{ width: 'auto', padding: '8px 16px' }}
            >
              <FileText size={16} />
              <span className="hide-mobile">{t('logs.live_open_editor')}</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="auth-error mb-4">{error}</div>}

      <div className="live-log-layout">
        <aside className="live-log-actions" aria-label={t('logs.live_actions_label')}>
          <button
            type="button"
            className={`live-log-action-btn ${motorRunning ? 'is-active' : ''}`}
            onClick={handleMotorToggle}
            disabled={busy}
          >
            <Zap size={18} />
            {motorRunning ? t('logs.live_motor_stop') : t('logs.live_motor_start')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={handleCastOff} disabled={busy}>
            <Anchor size={18} />
            {t('logs.live_cast_off')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={handleMoor} disabled={busy}>
            <Anchor size={18} style={{ transform: 'scaleX(-1)' }} />
            {t('logs.live_moor')}
          </button>
          <button
            type="button"
            className="live-log-action-btn"
            onClick={() => { setSelectedSails([]); setModal('sails') }}
            disabled={busy}
          >
            <Sailboat size={18} />
            {t('logs.live_sails_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={handleFix} disabled={busy}>
            <MapPin size={18} />
            {t('logs.live_fix')}
          </button>
          <button
            type="button"
            className="live-log-action-btn"
            onClick={() => { setCommentText(''); setModal('comment') }}
            disabled={busy}
          >
            <MessageSquare size={18} />
            {t('logs.live_comment_btn')}
          </button>
        </aside>

        <section className="live-log-stream-panel" aria-label={t('logs.live_stream_label')}>
          <h3 className="live-log-stream-title">{t('logs.live_stream_title')}</h3>
          {events.length === 0 ? (
            <p className="live-log-empty">{t('logs.live_no_events')}</p>
          ) : (
            <ol className="live-log-stream">
              {events.map((event, index) => (
                <li key={`${event.time}-${index}`} className="live-log-entry">
                  <time className="live-log-time">{event.time}</time>
                  <span className="live-log-summary">{formatEventSummary(event, t)}</span>
                </li>
              ))}
              <div ref={streamEndRef} />
            </ol>
          )}
        </section>
      </div>

      {modal === 'sails' && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal glass" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_sails_pick')}</h3>
            <div className="sails-picker-pills live-log-sail-pills">
              {sailOptions.map((sail) => (
                <button
                  key={sail}
                  type="button"
                  className={`sail-pill ${selectedSails.some((s) => s.toLowerCase() === sail.toLowerCase()) ? 'active' : ''}`}
                  onClick={() => toggleSailSelection(sail)}
                >
                  {sail}
                </button>
              ))}
            </div>
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>
                {t('logs.confirm_no')}
              </button>
              <button type="button" className="btn primary" onClick={confirmSails} disabled={selectedSails.length === 0}>
                {t('logs.live_sails_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'comment' && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal glass" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_comment_btn')}</h3>
            <input
              type="text"
              className="input-text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t('logs.live_comment_placeholder')}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmComment() }}
            />
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>
                {t('logs.confirm_no')}
              </button>
              <button type="button" className="btn primary" onClick={confirmComment} disabled={!commentText.trim()}>
                {t('logs.live_comment_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
