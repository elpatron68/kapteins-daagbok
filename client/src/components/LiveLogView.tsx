import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Anchor,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CloudSun,
  Compass,
  Droplets,
  FileText,
  Fuel,
  Gauge,
  MapPin,
  MessageSquare,
  Radio,
  Sailboat,
  Undo2,
  Zap
} from 'lucide-react'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson } from '../services/crypto.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import {
  appendQuickEvent,
  appendTankRefill,
  findOrCreateTodayEntry,
  loadEntry,
  removeLastEvent
} from '../services/quickEventLog.js'
import { formatEventSummary } from '../utils/formatEventSummary.js'
import {
  getLastAutoPositionMs,
  isMotorRunningFromEvents,
  LIVE_EVENT_CODES,
  liveCommentRemark,
  liveFuelRemark,
  livePrecipRemark,
  liveSailsRemark,
  liveSogRemark,
  liveStwRemark,
  liveTempRemark,
  liveWaterRemark
} from '../utils/liveEventCodes.js'
import { getCurrentPosition } from '../utils/geolocation.js'
import { sortLogEventsByTime, type LogEventPayload } from '../utils/logEntryPayload.js'
import { useDialog } from './ModalDialog.tsx'

interface LiveLogViewProps {
  logbookId: string
  onOpenEditor: (entryId: string) => void
  onSwitchToList: () => void
}

type LiveModal =
  | 'none'
  | 'sails'
  | 'comment'
  | 'wind'
  | 'pressure'
  | 'temp'
  | 'precip'
  | 'sea_state'
  | 'course'
  | 'fuel'
  | 'water'
  | 'sog'
  | 'stw'

const AUTO_POSITION_INTERVAL_MS = 3 * 60 * 60 * 1000
const AUTO_POSITION_CHECK_MS = 60_000
const UNDO_TIMEOUT_MS = 5000

function hapticPulse() {
  navigator.vibrate?.(40)
}

function lastCourseFromEvents(events: LogEventPayload[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].mgk.trim()) return events[i].mgk
  }
  return ''
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
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [valueInput, setValueInput] = useState('')
  const [valueInputSecondary, setValueInputSecondary] = useState('')
  const [selectedSails, setSelectedSails] = useState<string[]>([])
  const [undoVisible, setUndoVisible] = useState(false)

  const streamEndRef = useRef<HTMLDivElement | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const autoPositionBusyRef = useRef(false)

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

  const showUndo = useCallback(() => {
    setUndoVisible(true)
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    undoTimerRef.current = window.setTimeout(() => {
      setUndoVisible(false)
      undoTimerRef.current = null
    }, UNDO_TIMEOUT_MS)
  }, [])

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

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!entryId || loading) return

    const maybeAutoPosition = async () => {
      if (document.visibilityState !== 'visible' || autoPositionBusyRef.current || busy) return

      const lastMs = getLastAutoPositionMs(events, date)
      if (lastMs != null && Date.now() - lastMs < AUTO_POSITION_INTERVAL_MS) return

      autoPositionBusyRef.current = true
      try {
        const coords = await getCurrentPosition()
        await appendQuickEvent(logbookId, entryId, {
          gpsLat: coords.lat,
          gpsLng: coords.lng,
          remarks: LIVE_EVENT_CODES.AUTO_POSITION
        })
        await refreshEntry(entryId)
      } catch {
        // Silent — auto-position is best-effort
      } finally {
        autoPositionBusyRef.current = false
      }
    }

    const interval = window.setInterval(() => void maybeAutoPosition(), AUTO_POSITION_CHECK_MS)
    return () => window.clearInterval(interval)
  }, [entryId, loading, events, date, logbookId, refreshEntry, busy])

  const runQuickAction = async (
    action: () => Promise<void>,
    trackEvent?: string,
    withUndo = true
  ) => {
    if (!entryId || busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      await refreshEntry(entryId)
      if (withUndo) showUndo()
      if (trackEvent) trackPlausibleEvent(PlausibleEvents.TRAVEL_DAY_SAVED, { context: trackEvent })
    } catch (err: unknown) {
      console.error('Live log action failed:', err)
      setError(err instanceof Error ? err.message : t('logs.live_action_error'))
    } finally {
      setBusy(false)
    }
  }

  const openValueModal = (type: LiveModal, primary = '', secondary = '') => {
    setValueInput(primary)
    setValueInputSecondary(secondary)
    setModal(type)
  }

  const openSogModal = async () => {
    let prefill = ''
    try {
      const pos = await getCurrentPosition()
      if (pos.speedKn != null) prefill = String(pos.speedKn)
    } catch {
      // Manual entry when GPS speed unavailable
    }
    openValueModal('sog', prefill)
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
      await appendQuickEvent(logbookId, entryId, { remarks: LIVE_EVENT_CODES.CAST_OFF })
    }, 'live_cast_off')
  }

  const handleMoor = () => {
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, { remarks: LIVE_EVENT_CODES.MOOR })
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

  const handleUndo = () => {
    if (!entryId || busy) return
    setUndoVisible(false)
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    void runQuickAction(async () => {
      await removeLastEvent(logbookId, entryId)
    }, 'live_undo', false)
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
      await appendQuickEvent(logbookId, entryId, { remarks: liveCommentRemark(text) })
    }, 'live_comment')
  }

  const confirmValueModal = () => {
    if (!entryId) return
    const primary = valueInput.trim()
    const secondary = valueInputSecondary.trim()

    switch (modal) {
      case 'wind':
        if (!primary && !secondary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            windDirection: primary,
            windStrength: secondary,
            remarks: LIVE_EVENT_CODES.WIND
          })
        }, 'live_wind')
        break
      case 'pressure':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            windPressure: primary,
            remarks: LIVE_EVENT_CODES.PRESSURE
          })
        }, 'live_pressure')
        break
      case 'temp':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, { remarks: liveTempRemark(primary) })
        }, 'live_temp')
        break
      case 'precip':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, { remarks: livePrecipRemark(primary) })
        }, 'live_precip')
        break
      case 'sea_state':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            seaState: primary,
            remarks: LIVE_EVENT_CODES.SEA_STATE
          })
        }, 'live_sea_state')
        break
      case 'course': {
        const course = primary || lastCourseFromEvents(events)
        if (!course) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            mgk: course,
            remarks: LIVE_EVENT_CODES.COURSE
          })
        }, 'live_course')
        break
      }
      case 'fuel': {
        const liters = parseFloat(primary)
        if (!Number.isFinite(liters) || liters <= 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendTankRefill(logbookId, entryId, 'fuel', liters, {
            remarks: liveFuelRemark(String(liters))
          })
        }, 'live_fuel')
        break
      }
      case 'water': {
        const liters = parseFloat(primary)
        if (!Number.isFinite(liters) || liters <= 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendTankRefill(logbookId, entryId, 'freshwater', liters, {
            remarks: liveWaterRemark(String(liters))
          })
        }, 'live_water')
        break
      }
      case 'sog': {
        const speedKn = parseFloat(primary.replace(',', '.'))
        if (!Number.isFinite(speedKn) || speedKn < 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            remarks: liveSogRemark(String(speedKn))
          })
        }, 'live_sog')
        break
      }
      case 'stw': {
        const speedKn = parseFloat(primary.replace(',', '.'))
        if (!Number.isFinite(speedKn) || speedKn < 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            remarks: liveStwRemark(String(speedKn))
          })
        }, 'live_stw')
        break
      }
      default:
        break
    }
  }

  const toggleSailSelection = (sail: string) => {
    setSelectedSails((prev) =>
      prev.some((s) => s.toLowerCase() === sail.toLowerCase())
        ? prev.filter((s) => s.toLowerCase() !== sail.toLowerCase())
        : [...prev, sail]
    )
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
          <button type="button" className="btn secondary" onClick={onSwitchToList} style={{ width: 'auto', padding: '8px 16px' }}>
            <ChevronLeft size={16} />
            <span className="hide-mobile">{t('logs.view_list')}</span>
          </button>
          {entryId && (
            <button type="button" className="btn secondary" onClick={() => onOpenEditor(entryId)} style={{ width: 'auto', padding: '8px 16px' }}>
              <FileText size={16} />
              <span className="hide-mobile">{t('logs.live_open_editor')}</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="auth-error mb-4">{error}</div>}

      <div className="live-log-layout">
        <aside className="live-log-actions" aria-label={t('logs.live_actions_label')}>
          <button type="button" className={`live-log-action-btn ${motorRunning ? 'is-active' : ''}`} onClick={handleMotorToggle} disabled={busy}>
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
          <button type="button" className="live-log-action-btn" onClick={() => { setSelectedSails([]); setModal('sails') }} disabled={busy}>
            <Sailboat size={18} />
            {t('logs.live_sails_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => openValueModal('course', lastCourseFromEvents(events))} disabled={busy}>
            <Compass size={18} />
            {t('logs.live_course_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => void openSogModal()} disabled={busy}>
            <Gauge size={18} />
            {t('logs.live_sog_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => openValueModal('stw')} disabled={busy}>
            <Gauge size={18} style={{ transform: 'scaleX(-1)' }} />
            {t('logs.live_stw_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => openValueModal('fuel')} disabled={busy}>
            <Fuel size={18} />
            {t('logs.live_fuel_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => openValueModal('water')} disabled={busy}>
            <Droplets size={18} />
            {t('logs.live_water_btn')}
          </button>

          <div className="live-log-weather-group">
            <button
              type="button"
              className={`live-log-action-btn live-log-weather-toggle ${weatherExpanded ? 'is-expanded' : ''}`}
              onClick={() => setWeatherExpanded((prev) => !prev)}
              disabled={busy}
              aria-expanded={weatherExpanded}
            >
              <CloudSun size={18} />
              {t('logs.live_weather_btn')}
              {weatherExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {weatherExpanded && (
              <div className="live-log-weather-submenu">
                <button type="button" className="live-log-subaction-btn" onClick={() => openValueModal('wind')} disabled={busy}>
                  {t('logs.live_wind_btn')}
                </button>
                <button type="button" className="live-log-subaction-btn" onClick={() => openValueModal('temp')} disabled={busy}>
                  {t('logs.live_temp_btn')}
                </button>
                <button type="button" className="live-log-subaction-btn" onClick={() => openValueModal('pressure')} disabled={busy}>
                  {t('logs.live_pressure_btn')}
                </button>
                <button type="button" className="live-log-subaction-btn" onClick={() => openValueModal('precip')} disabled={busy}>
                  {t('logs.live_precip_btn')}
                </button>
                <button type="button" className="live-log-subaction-btn" onClick={() => openValueModal('sea_state')} disabled={busy}>
                  {t('logs.live_sea_state_btn')}
                </button>
              </div>
            )}
          </div>

          <button type="button" className="live-log-action-btn" onClick={handleFix} disabled={busy}>
            <MapPin size={18} />
            {t('logs.live_fix')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => { setCommentText(''); setModal('comment') }} disabled={busy}>
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

      {undoVisible && events.length > 0 && (
        <div className="live-log-undo-bar" role="status">
          <span>{t('logs.live_undo_hint')}</span>
          <button type="button" className="btn secondary" onClick={handleUndo} disabled={busy}>
            <Undo2 size={16} />
            {t('logs.live_undo_btn')}
          </button>
        </div>
      )}

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
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.confirm_no')}</button>
              <button type="button" className="btn primary" onClick={confirmSails} disabled={selectedSails.length === 0}>{t('logs.live_sails_confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'comment' && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal glass" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_comment_btn')}</h3>
            <input type="text" className="input-text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={t('logs.live_comment_placeholder')} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') confirmComment() }} />
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.confirm_no')}</button>
              <button type="button" className="btn primary" onClick={confirmComment} disabled={!commentText.trim()}>{t('logs.live_comment_confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'wind' && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal glass" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_wind_btn')}</h3>
            <input type="text" className="input-text mb-2" value={valueInput} onChange={(e) => setValueInput(e.target.value)} placeholder={t('logs.event_wind_direction')} autoFocus />
            <input type="text" className="input-text" value={valueInputSecondary} onChange={(e) => setValueInputSecondary(e.target.value)} placeholder={t('logs.event_wind_strength')} />
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.confirm_no')}</button>
              <button type="button" className="btn primary" onClick={confirmValueModal}>{t('logs.live_sails_confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {['pressure', 'temp', 'precip', 'sea_state', 'course', 'fuel', 'water', 'sog', 'stw'].includes(modal) && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal glass" onClick={(e) => e.stopPropagation()}>
            <h3>
              {modal === 'pressure' && t('logs.live_pressure_btn')}
              {modal === 'temp' && t('logs.live_temp_btn')}
              {modal === 'precip' && t('logs.live_precip_btn')}
              {modal === 'sea_state' && t('logs.live_sea_state_btn')}
              {modal === 'course' && t('logs.live_course_btn')}
              {modal === 'fuel' && t('logs.live_fuel_btn')}
              {modal === 'water' && t('logs.live_water_btn')}
              {modal === 'sog' && t('logs.live_sog_btn')}
              {modal === 'stw' && t('logs.live_stw_btn')}
            </h3>
            {modal === 'sog' && (
              <p className="live-log-modal-hint">{t('logs.live_sog_hint')}</p>
            )}
            <input
              type="text"
              inputMode="decimal"
              className="input-text"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder={
                modal === 'pressure' ? t('logs.live_pressure_placeholder')
                  : modal === 'temp' ? t('logs.live_temp_placeholder')
                    : modal === 'precip' ? t('logs.live_precip_placeholder')
                      : modal === 'sea_state' ? t('logs.live_sea_state_placeholder')
                        : modal === 'course' ? t('logs.live_course_placeholder')
                          : modal === 'fuel' ? t('logs.live_fuel_placeholder')
                            : modal === 'water' ? t('logs.live_water_placeholder')
                              : modal === 'sog' ? t('logs.live_sog_placeholder')
                                : t('logs.live_stw_placeholder')
              }
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmValueModal() }}
            />
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.confirm_no')}</button>
              <button type="button" className="btn primary" onClick={confirmValueModal}>{t('logs.live_sails_confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
