import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  Camera,
  Radio,
  Sailboat,
  Undo2,
  Zap
} from 'lucide-react'
import { db } from '../services/db.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { decryptJson } from '../services/crypto.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import {
  appendQuickEvent,
  appendQuickEvents,
  appendTankRefill,
  findOrCreateTodayEntry,
  loadEntry,
  removeLastEvent
} from '../services/quickEventLog.js'
import { formatEventSummary } from '../utils/formatEventSummary.js'
import {
  getLastAutoPositionMs,
  getLastPositionFixWithin,
  getLatestPositionFix,
  isMotorRunningFromEvents,
  LIVE_EVENT_CODES,
  LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS,
  liveCommentRemark,
  liveFuelRemark,
  livePhotoRemark,
  livePrecipRemark,
  liveSailsRemark,
  liveSogRemark,
  liveStwRemark,
  liveTempRemark,
  liveWaterRemark
} from '../utils/liveEventCodes.js'
import { parseOwmCurrentWeather } from '../utils/openWeatherMap.js'
import { fetchOpenWeatherCurrent, WeatherApiError } from '../services/weather.js'
import { getCurrentPosition, normalizeGpsCoordinates } from '../utils/geolocation.js'
import { sortLogEventsByTime, type LogEventPayload } from '../utils/logEntryPayload.js'
import {
  dedupeSailNames,
  isSailInSelection,
  joinSailSelection,
  toggleSailInSelection
} from '../utils/sailSelection.js'
import { useDialog } from './ModalDialog.tsx'
import CourseDialInput from './CourseDialInput.tsx'
import LiveCameraCapture from './LiveCameraCapture.tsx'
import { saveEntryPhoto, deleteEntryPhoto } from '../services/photoAttachments.js'
import { blobToCompressedJpegDataUrl } from '../utils/imageCompress.js'

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
  | 'fix'
  | 'photo'

const AUTO_POSITION_INTERVAL_MS = 3 * 60 * 60 * 1000
const AUTO_POSITION_CHECK_MS = 60_000
const AUTO_POSITION_START_DELAY_MS = 3000
const LIVE_LOG_INIT_TIMEOUT_MS = 25_000
const UNDO_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function hapticPulse() {
  navigator.vibrate?.(40)
}

function lastCourseFromEvents(events: LogEventPayload[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const mgk = events[i].mgk?.trim()
    if (mgk) return mgk
  }
  return ''
}

function lastWindDirectionFromEvents(events: LogEventPayload[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const direction = events[i].windDirection?.trim()
    if (direction) return direction
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
  const [weatherOwmLoading, setWeatherOwmLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [valueInput, setValueInput] = useState('')
  const [valueInputSecondary, setValueInputSecondary] = useState('')
  const [selectedSails, setSelectedSails] = useState<string[]>([])
  const [undoVisible, setUndoVisible] = useState(false)
  const [fixLat, setFixLat] = useState('')
  const [fixLng, setFixLng] = useState('')
  const [fixGpsLoading, setFixGpsLoading] = useState(false)
  const [fixGpsUnavailable, setFixGpsUnavailable] = useState(false)
  const [photoCaption, setPhotoCaption] = useState('')
  const [photoSaving, setPhotoSaving] = useState(false)
  const [undoHint, setUndoHint] = useState<'event' | 'photo'>('event')

  const streamEndRef = useRef<HTMLDivElement | null>(null)
  const undoPhotoIdRef = useRef<string | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const autoPositionBusyRef = useRef(false)
  const initSeqRef = useRef(0)
  const eventsRef = useRef(events)
  const dateRef = useRef(date)
  eventsRef.current = events
  dateRef.current = date

  const defaultSails = useMemo(
    () => (i18n.language === 'de'
      ? ['Großsegel', 'Genua', 'Fock', 'Spinnaker', 'Gennaker']
      : ['Mainsail', 'Genoa', 'Jib', 'Spinnaker', 'Gennaker']),
    [i18n.language]
  )
  const sailOptions = useMemo(
    () => dedupeSailNames(yachtSails.length > 0 ? yachtSails : defaultSails),
    [yachtSails, defaultSails]
  )
  const motorRunning = isMotorRunningFromEvents(events)
  const motorLabel = t('logs.motor_propulsion')

  const applyLoadedEntry = useCallback((loaded: NonNullable<Awaited<ReturnType<typeof loadEntry>>>) => {
    const entryEvents = (loaded.data.events as LogEventPayload[]) || []
    setDayOfTravel(String(loaded.data.dayOfTravel || ''))
    setDate(String(loaded.data.date || ''))
    setEvents(sortLogEventsByTime(entryEvents.map((e) => ({ ...e }))))
  }, [])

  const refreshEntry = useCallback(async (id: string) => {
    const loaded = await loadEntry(logbookId, id)
    if (!loaded) return
    applyLoadedEntry(loaded)
  }, [logbookId, applyLoadedEntry])

  const showUndo = useCallback((hint: 'event' | 'photo' = 'event') => {
    setUndoHint(hint)
    setUndoVisible(true)
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    undoTimerRef.current = window.setTimeout(() => {
      setUndoVisible(false)
      undoTimerRef.current = null
      undoPhotoIdRef.current = null
    }, UNDO_TIMEOUT_MS)
  }, [])

  const runInit = useCallback(async () => {
    const seq = ++initSeqRef.current
    setLoading(true)
    setError(null)
    setEntryId(null)
    setEvents([])
    setYachtSails([])

    if (!logbookId.trim()) {
      setError(t('logs.live_load_error'))
      setLoading(false)
      return
    }

    try {
      const id = await withTimeout(
        findOrCreateTodayEntry(logbookId),
        LIVE_LOG_INIT_TIMEOUT_MS,
        t('logs.live_load_error')
      )
      if (seq !== initSeqRef.current) return
      setEntryId(id)

      const logbookKey = await getLogbookKey(logbookId)
      if (logbookKey) {
        const yacht = await db.yachts.get(logbookId)
        if (yacht) {
          try {
            const decrypted = await decryptJson(
              yacht.encryptedData,
              yacht.iv,
              yacht.tag,
              logbookKey
            )
            if (decrypted?.sails && Array.isArray(decrypted.sails)) {
              setYachtSails(decrypted.sails as string[])
            }
          } catch {
            // Yacht profile optional for live log
          }
        }
      }

      const loaded = await loadEntry(logbookId, id)
      if (seq !== initSeqRef.current) return
      if (loaded) {
        applyLoadedEntry(loaded)
      } else {
        throw new Error(t('logs.live_load_error'))
      }
    } catch (err: unknown) {
      if (seq !== initSeqRef.current) return
      console.error('Failed to init live log:', err)
      setError(err instanceof Error ? err.message : t('logs.live_load_error'))
    } finally {
      if (seq === initSeqRef.current) {
        setLoading(false)
      }
    }
  }, [logbookId, applyLoadedEntry, t])

  useEffect(() => {
    void runInit()
    return () => {
      initSeqRef.current += 1
    }
  }, [runInit])

  useEffect(() => {
    if (!loading && entryId) {
      trackPlausibleEvent(PlausibleEvents.LIVE_LOG_OPENED)
    }
  }, [loading, entryId])

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

      const lastMs = getLastAutoPositionMs(eventsRef.current, dateRef.current)
      if (lastMs != null && Date.now() - lastMs < AUTO_POSITION_INTERVAL_MS) return

      autoPositionBusyRef.current = true
      try {
        const coords = await getCurrentPosition(8000)
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

    let intervalRef: number | undefined
    const startTimer = window.setTimeout(() => {
      void maybeAutoPosition()
      intervalRef = window.setInterval(() => void maybeAutoPosition(), AUTO_POSITION_CHECK_MS)
    }, AUTO_POSITION_START_DELAY_MS)

    return () => {
      window.clearTimeout(startTimer)
      if (intervalRef !== undefined) window.clearInterval(intervalRef)
    }
  }, [entryId, loading, logbookId, refreshEntry, busy])

  const runQuickAction = async (
    action: () => Promise<boolean | void>,
    trackAction?: string,
    withUndo = true
  ) => {
    if (!entryId || busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = await action()
      if (saved === false) return
      await refreshEntry(entryId)
      if (withUndo) showUndo()
      if (trackAction) {
        trackPlausibleEvent(PlausibleEvents.LIVE_LOG_EVENT_LOGGED, { action: trackAction })
      }
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
    const starting = !motorRunning
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, {
        sailsOrMotor: starting ? motorLabel : '',
        remarks: starting ? LIVE_EVENT_CODES.MOTOR_START : LIVE_EVENT_CODES.MOTOR_STOP
      })
    }, starting ? 'motor_start' : 'motor_stop')
  }

  const handleCastOff = () => {
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, { remarks: LIVE_EVENT_CODES.CAST_OFF })
    }, 'cast_off')
  }

  const handleMoor = () => {
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, { remarks: LIVE_EVENT_CODES.MOOR })
    }, 'moor')
  }

  const openFixModal = async () => {
    setFixLat('')
    setFixLng('')
    setFixGpsUnavailable(false)
    setFixGpsLoading(true)
    setModal('fix')
    try {
      const coords = await getCurrentPosition()
      setFixLat(coords.lat)
      setFixLng(coords.lng)
    } catch {
      setFixGpsUnavailable(true)
    } finally {
      setFixGpsLoading(false)
    }
  }

  const retryFixGps = async () => {
    setFixGpsLoading(true)
    setFixGpsUnavailable(false)
    try {
      const coords = await getCurrentPosition()
      setFixLat(coords.lat)
      setFixLng(coords.lng)
    } catch {
      setFixGpsUnavailable(true)
      await showAlert(t('logs.live_gps_error'), t('logs.live_fix'))
    } finally {
      setFixGpsLoading(false)
    }
  }

  const confirmFix = () => {
    const coords = normalizeGpsCoordinates(fixLat, fixLng)
    if (!coords) {
      void showAlert(t('logs.live_fix_invalid'), t('logs.live_fix'))
      return
    }
    setModal('none')
    void runQuickAction(async () => {
      if (!entryId) return false
      await appendQuickEvent(logbookId, entryId, {
        gpsLat: coords.lat,
        gpsLng: coords.lng,
        remarks: LIVE_EVENT_CODES.FIX
      })
    }, 'fix')
  }

  const handleFetchOwmWeather = () => {
    if (!entryId || busy || weatherOwmLoading) return

    const position = getLastPositionFixWithin(
      events,
      date,
      LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS
    )
    if (!position) {
      const latest = getLatestPositionFix(events, date)
      void showAlert(
        latest
          ? t('logs.live_weather_fix_stale')
          : t('logs.live_weather_fix_required'),
        t('logs.live_weather_owm_btn')
      )
      return
    }

    const { lat, lng } = position
    const id = entryId
    setWeatherOwmLoading(true)
    setError(null)
    void (async () => {
      try {
        let data: Record<string, unknown>
        try {
          data = await fetchOpenWeatherCurrent({ lat, lon: lng })
        } catch (err) {
          if (err instanceof WeatherApiError && err.code === 'NO_KEY') {
            void showAlert(t('settings.no_key'), t('logs.live_weather_owm_btn'))
            return
          }
          console.error('Live log OWM weather failed:', err)
          void showAlert(t('settings.weather_error'), t('logs.live_weather_owm_btn'))
          return
        }

        const parsed = parseOwmCurrentWeather(data)
        const partials: Partial<LogEventPayload>[] = []
        if (parsed.windDirection || parsed.windStrength) {
          partials.push({
            windDirection: parsed.windDirection,
            windStrength: parsed.windStrength,
            weatherIcon: parsed.weatherIcon || undefined,
            remarks: LIVE_EVENT_CODES.WIND
          })
        }
        if (parsed.windPressure) {
          partials.push({
            windPressure: parsed.windPressure,
            remarks: LIVE_EVENT_CODES.PRESSURE
          })
        }
        if (parsed.tempC) {
          partials.push({ remarks: liveTempRemark(parsed.tempC) })
        }
        if (parsed.precipText) {
          partials.push({ remarks: livePrecipRemark(parsed.precipText) })
        }
        if (partials.length === 0) {
          void showAlert(t('settings.weather_error'), t('logs.live_weather_owm_btn'))
          return
        }

        await appendQuickEvents(logbookId, id, partials)
        await refreshEntry(id)
        showUndo()
        trackPlausibleEvent(PlausibleEvents.LIVE_LOG_EVENT_LOGGED, { action: 'weather_owm' })
      } catch (err: unknown) {
        console.error('Live log OWM weather save failed:', err)
        setError(err instanceof Error ? err.message : t('logs.live_action_error'))
      } finally {
        setWeatherOwmLoading(false)
      }
    })()
  }

  const handleUndo = () => {
    if (!entryId || busy) return
    const photoId = undoPhotoIdRef.current
    setUndoVisible(false)
    undoPhotoIdRef.current = null
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    void runQuickAction(async () => {
      if (photoId) {
        await deleteEntryPhoto(logbookId, photoId)
      }
      await removeLastEvent(logbookId, entryId)
    }, 'undo', false)
  }

  const openPhotoModal = () => {
    setPhotoCaption('')
    setModal('photo')
  }

  const closePhotoModal = () => {
    if (photoSaving) return
    setModal('none')
    setPhotoCaption('')
  }

  const handlePhotoCapture = (blob: Blob) => {
    if (!entryId || photoSaving) return
    const caption = photoCaption.trim()
    setPhotoSaving(true)
    void (async () => {
      try {
        const imageDataUrl = await blobToCompressedJpegDataUrl(blob)
        const photoId = await saveEntryPhoto({
          logbookId,
          entryId,
          imageDataUrl,
          caption,
          analyticsContext: 'live_log'
        })
        await appendQuickEvent(logbookId, entryId, {
          remarks: livePhotoRemark(caption)
        })
        await refreshEntry(entryId)
        undoPhotoIdRef.current = photoId
        setModal('none')
        setPhotoCaption('')
        showUndo('photo')
        trackPlausibleEvent(PlausibleEvents.LIVE_LOG_EVENT_LOGGED, { action: 'photo' })
      } catch (err: unknown) {
        console.error('Live log photo save failed:', err)
        void showAlert(
          err instanceof Error ? err.message : t('logs.live_photo_error'),
          t('logs.live_photo_btn')
        )
      } finally {
        setPhotoSaving(false)
      }
    })()
  }

  const confirmSails = () => {
    const sailsLabel = joinSailSelection(selectedSails)
    if (!sailsLabel) {
      setModal('none')
      return
    }
    setModal('none')
    setSelectedSails([])
    void runQuickAction(async () => {
      if (!entryId) return
      await appendQuickEvent(logbookId, entryId, {
        sailsOrMotor: sailsLabel,
        remarks: liveSailsRemark(sailsLabel)
      })
    }, 'sails')
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
    }, 'comment')
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
        }, 'wind')
        break
      case 'pressure':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            windPressure: primary,
            remarks: LIVE_EVENT_CODES.PRESSURE
          })
        }, 'pressure')
        break
      case 'temp':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, { remarks: liveTempRemark(primary) })
        }, 'temp')
        break
      case 'precip':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, { remarks: livePrecipRemark(primary) })
        }, 'precip')
        break
      case 'sea_state':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            seaState: primary,
            remarks: LIVE_EVENT_CODES.SEA_STATE
          })
        }, 'sea_state')
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
        }, 'course')
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
        }, 'fuel')
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
        }, 'water')
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
        }, 'sog')
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
        }, 'stw')
        break
      }
      default:
        break
    }
  }

  const toggleSailSelection = (sail: string) => {
    setSelectedSails((prev) => toggleSailInSelection(prev, sail))
  }

  const closeModal = () => setModal('none')

  if (loading) {
    return (
      <div className="tab-placeholder">
        <Radio className="header-logo spin" size={48} />
        <p>{t('logs.live_loading')}</p>
        {error && (
          <>
            <p className="auth-error" style={{ marginTop: 12 }}>{error}</p>
            <button type="button" className="btn secondary" style={{ marginTop: 12 }} onClick={() => void runInit()}>
              {t('logs.live_retry')}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <>
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
                <button
                  type="button"
                  className="live-log-subaction-btn live-log-subaction-btn-owm"
                  onClick={handleFetchOwmWeather}
                  disabled={busy || weatherOwmLoading}
                  aria-busy={busy || weatherOwmLoading}
                >
                  {weatherOwmLoading ? t('logs.live_weather_owm_loading') : t('logs.live_weather_owm_btn')}
                </button>
                <button type="button" className="live-log-subaction-btn" onClick={() => openValueModal('wind', lastWindDirectionFromEvents(events))} disabled={busy}>
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

          <button type="button" className="live-log-action-btn" onClick={() => void openFixModal()} disabled={busy}>
            <MapPin size={18} />
            {t('logs.live_fix')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => { setCommentText(''); setModal('comment') }} disabled={busy}>
            <MessageSquare size={18} />
            {t('logs.live_comment_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={openPhotoModal} disabled={busy || photoSaving}>
            <Camera size={18} />
            {t('logs.live_photo_btn')}
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
    </div>

    {((undoVisible && events.length > 0) || modal !== 'none') && createPortal(
      <>
      {undoVisible && events.length > 0 && (
        <div className="live-log-undo-bar" role="status">
          <div className="live-log-undo-bar-inner">
            <span>
              {undoHint === 'photo' ? t('logs.live_undo_photo_hint') : t('logs.live_undo_hint')}
            </span>
            <button type="button" className="btn secondary" onClick={handleUndo} disabled={busy}>
              <Undo2 size={16} />
              {t('logs.live_undo_btn')}
            </button>
          </div>
        </div>
      )}

      {modal === 'sails' && (
        <div
          className="live-log-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="live-log-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_sails_pick')}</h3>
            <p className="live-log-modal-hint">{t('logs.live_sails_pick_hint')}</p>
            <div
              className="sails-picker-pills live-log-sail-pills"
              role="group"
              aria-label={t('logs.live_sails_pick')}
            >
              {sailOptions.map((sail) => {
                const active = isSailInSelection(selectedSails, sail)
                return (
                  <button
                    key={sail}
                    type="button"
                    className={`sail-pill ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleSailSelection(sail)}
                  >
                    {sail}
                  </button>
                )
              })}
            </div>
            {selectedSails.length > 0 && (
              <p className="live-log-sails-selection" aria-live="polite">
                {t('logs.live_sails_selected', { sails: joinSailSelection(selectedSails) })}
              </p>
            )}
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={closeModal}>{t('logs.confirm_no')}</button>
              <button
                type="button"
                className="btn primary"
                onClick={confirmSails}
                disabled={selectedSails.length === 0}
              >
                {selectedSails.length > 0
                  ? t('logs.live_sails_confirm_count', { count: selectedSails.length })
                  : t('logs.live_sails_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'fix' && (
        <div
          className="live-log-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="live-log-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_fix')}</h3>
            {fixGpsUnavailable && (
              <p className="live-log-modal-hint">{t('logs.live_fix_manual_hint')}</p>
            )}
            <fieldset className="live-log-fix-coords" disabled={busy}>
              <legend className="live-log-fix-label">{t('logs.event_gps')}</legend>
              <div className="live-log-fix-coords-row">
                <label className="live-log-fix-field">
                  <span className="live-log-fix-field-label">{t('logs.live_fix_lat_placeholder')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-text"
                    placeholder="54.123456"
                    value={fixLat}
                    onChange={(e) => setFixLat(e.target.value)}
                    autoFocus
                  />
                </label>
                <label className="live-log-fix-field">
                  <span className="live-log-fix-field-label">{t('logs.live_fix_lng_placeholder')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-text"
                    placeholder="10.654321"
                    value={fixLng}
                    onChange={(e) => setFixLng(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmFix() }}
                  />
                </label>
              </div>
              <div className="live-log-fix-gps-row">
                <button
                  type="button"
                  className="btn secondary live-log-fix-gps-btn"
                  onClick={() => void retryFixGps()}
                  title={t('logs.gps_btn')}
                  disabled={fixGpsLoading}
                  aria-label={t('logs.gps_btn')}
                >
                  <MapPin size={16} />
                  <span>{fixGpsLoading ? t('logs.live_fix_gps_loading') : t('logs.gps_btn')}</span>
                </button>
              </div>
            </fieldset>
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={closeModal}>{t('logs.confirm_no')}</button>
              <button
                type="button"
                className="btn primary"
                onClick={confirmFix}
                disabled={busy || !normalizeGpsCoordinates(fixLat, fixLng)}
              >
                {t('logs.live_sails_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'comment' && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal" onClick={(e) => e.stopPropagation()}>
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
          <div className="live-log-modal live-log-modal--dial" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_wind_btn')}</h3>
            <div className="live-log-dial-field">
              <label>{t('logs.event_wind_direction')}</label>
              <CourseDialInput
                value={valueInput}
                onChange={setValueInput}
                disabled={busy}
                allowCardinal
                displayMode="auto"
                size="sm"
                aria-label={t('logs.event_wind_direction')}
              />
            </div>
            <div className="live-log-dial-field">
              <label>{t('logs.event_wind_strength')}</label>
              <input
                type="text"
                className="input-text"
                value={valueInputSecondary}
                onChange={(e) => setValueInputSecondary(e.target.value)}
                placeholder="e.g. 4 Bft"
              />
            </div>
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.confirm_no')}</button>
              <button type="button" className="btn primary" onClick={confirmValueModal}>{t('logs.live_sails_confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'course' && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal live-log-modal--dial" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_course_btn')}</h3>
            <div className="live-log-dial-field">
              <label>{t('logs.event_mgk')}</label>
              <CourseDialInput
                value={valueInput}
                onChange={setValueInput}
                disabled={busy}
                size="sm"
                aria-label={t('logs.event_mgk')}
              />
            </div>
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.confirm_no')}</button>
              <button type="button" className="btn primary" onClick={confirmValueModal}>{t('logs.live_sails_confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {['pressure', 'temp', 'precip', 'sea_state', 'fuel', 'water', 'sog', 'stw'].includes(modal) && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {modal === 'pressure' && t('logs.live_pressure_btn')}
              {modal === 'temp' && t('logs.live_temp_btn')}
              {modal === 'precip' && t('logs.live_precip_btn')}
              {modal === 'sea_state' && t('logs.live_sea_state_btn')}
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

      <LiveCameraCapture
        open={modal === 'photo'}
        busy={photoSaving}
        caption={photoCaption}
        onCaptionChange={setPhotoCaption}
        onClose={closePhotoModal}
        onCapture={handlePhotoCapture}
      />
      </>,
      document.body
    )}
    </>
  )
}
