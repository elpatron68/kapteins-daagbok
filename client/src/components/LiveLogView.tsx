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
  Mic,
  Radio,
  Sailboat,
  Undo2,
  Waves,
  Zap
} from 'lucide-react'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { getAiAuthorized } from '../services/userPreferences.js'
import {
  appendQuickEvent as apiAppendQuickEvent,
  appendQuickEvents as apiAppendQuickEvents,
  appendTankRefill as apiAppendTankRefill,
  findOrCreateTodayEntry,
  loadEntry,
  patchEntryTides,
  removeLastEvent
} from '../services/quickEventLog.js'
import CreatorAvatar from './CreatorAvatar.tsx'
import {
  getLastAutoPositionMs,
  getLastLoggedPositionWithin,
  getLatestLoggedPosition,
  isMotorRunningFromEvents,
  LIVE_EVENT_CODES,
  LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS,
  liveCommentRemark,
  liveFuelRemark,
  livePhotoRemark,
  liveVoiceRemark,
  livePrecipRemark,
  liveSailsRemark,
  liveSogRemark,
  liveStwRemark,
  liveTempRemark,
  liveWaterRemark
} from '../utils/liveEventCodes.js'
import { formatAppDecimal, formatTankLiters, parseAppDecimal } from '../utils/numberFormat.js'

const formatSpeedKn = (speedKn: number) =>
  formatAppDecimal(speedKn, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
import { parseOwmCurrentWeather } from '../utils/openWeatherMap.js'
import { fetchOpenWeatherCurrent, WeatherApiError } from '../services/weather.js'
import { fetchTidesByPlace, fetchTidesNearby, TidesApiError } from '../services/tides.js'
import {
  buildTideLocationMeta,
  formatTideLocationLabel,
  resolveTideFetchLocation
} from '../utils/tideLocation.js'
import { parseTideTurtleForDate } from '../utils/tideTurtle.js'
import {
  geolocationErrorI18nKey,
  getCurrentPosition,
  getGeolocationErrorReason,
  hasSeenGeolocationLiveIntro,
  markGeolocationLiveIntroSeen,
  normalizeGpsCoordinates,
  queryGeolocationPermission,
  type GeolocationErrorReason,
  type GpsSignalQuality
} from '../utils/geolocation.js'
import { sortLogEventsByTime, type LogEventPayload } from '../utils/logEntryPayload.js'
import {
  dedupeSailNames,
  isSailInSelection,
  joinSailSelection,
  toggleSailInSelection
} from '../utils/sailSelection.js'
import { useDialog } from './ModalDialog.tsx'
import CourseDialInput from './CourseDialInput.tsx'
import GpsSignalHint from './GpsSignalHint.tsx'
import LiveCameraCapture from './LiveCameraCapture.tsx'
import LiveVoiceCapture from './LiveVoiceCapture.tsx'
import EventRemarksCell from './EventRemarksCell.tsx'
import { saveEntryPhoto, deleteEntryPhoto } from '../services/photoAttachments.js'
import { saveEntryVoiceMemo, deleteEntryVoiceMemo } from '../services/voiceAttachments.js'
import { blobToCompressedJpegDataUrl } from '../utils/imageCompress.js'
import { blobToAudioDataUrl } from '../utils/audioBlob.js'
import { useEntryVoiceMemos } from '../hooks/useEntryVoiceMemos.js'

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
  | 'visibility'
  | 'course'
  | 'fuel'
  | 'water'
  | 'sog'
  | 'stw'
  | 'position'
  | 'tides'
  | 'photo'
  | 'voice'

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

function gpsFailureAlertBody(
  t: (key: string) => string,
  reason: GeolocationErrorReason
): string {
  return `${t(geolocationErrorI18nKey(reason))}\n\n${t('logs.live_position_manual_hint')}`
}

function findActiveCreatorId(
  activeUsername: string | null,
  crewSnapshotsById: Record<string, any>,
  selectedSkipperId: string | null
): string {
  const username = (activeUsername || '').trim()
  if (username) {
    const matchEntry = Object.entries(crewSnapshotsById).find(
      ([_, snap]) => (snap?.name || '').trim().toLowerCase() === username.toLowerCase()
    )
    if (matchEntry) {
      return matchEntry[0]
    }
    return username
  }
  return selectedSkipperId || 'skipper'
}

export default function LiveLogView({
  logbookId,
  onOpenEditor,
  onSwitchToList
}: LiveLogViewProps) {
  const { t, i18n } = useTranslation()
  const { showAlert, showConfirm } = useDialog()
  const [geolocationAccessEpoch, setGeolocationAccessEpoch] = useState(0)

  const [entryId, setEntryId] = useState<string | null>(null)
  const [dayOfTravel, setDayOfTravel] = useState('')
  const [date, setDate] = useState('')
  const [departure, setDeparture] = useState('')
  const [events, setEvents] = useState<LogEventPayload[]>([])
  const [crewSnapshotsById, setCrewSnapshotsById] = useState<Record<string, any>>({})
  const [selectedSkipperId, setSelectedSkipperId] = useState<string | null>(null)
  const [yachtSails, setYachtSails] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<LiveModal>('none')
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  const [weatherOwmLoading, setWeatherOwmLoading] = useState(false)
  const [tidesLoading, setTidesLoading] = useState(false)
  const [tidePreview, setTidePreview] = useState<{
    highWater: string
    lowWater: string
    location: ReturnType<typeof buildTideLocationMeta>
  } | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [commentText, setCommentText] = useState('')
  const [valueInput, setValueInput] = useState('')
  const [valueInputSecondary, setValueInputSecondary] = useState('')
  const [selectedSails, setSelectedSails] = useState<string[]>([])
  const [undoVisible, setUndoVisible] = useState(false)
  const [positionLat, setPositionLat] = useState('')
  const [positionLng, setPositionLng] = useState('')
  const [positionGpsLoading, setPositionGpsLoading] = useState(false)
  const [positionGpsUnavailable, setPositionGpsUnavailable] = useState(false)
  const [positionGpsErrorReason, setPositionGpsErrorReason] = useState<GeolocationErrorReason | null>(null)
  const [positionGpsSignal, setPositionGpsSignal] = useState<{
    quality: GpsSignalQuality
    accuracyM: number | null
  } | null>(null)
  const [photoCaption, setPhotoCaption] = useState('')
  const [photoSaving, setPhotoSaving] = useState(false)
  const [voiceCaption, setVoiceCaption] = useState('')
  const [voiceSaving, setVoiceSaving] = useState(false)
  const [undoHint, setUndoHint] = useState<'event' | 'photo' | 'voice'>('event')

  const streamEndRef = useRef<HTMLDivElement | null>(null)
  const undoPhotoIdRef = useRef<string | null>(null)
  const undoVoiceIdRef = useRef<string | null>(null)
  const undoTimerRef = useRef<number | null>(null)
  const autoPositionBusyRef = useRef(false)
  const busyRef = useRef(busy)
  const initSeqRef = useRef(0)
  const eventsRef = useRef(events)
  const dateRef = useRef(date)
  eventsRef.current = events
  dateRef.current = date
  busyRef.current = busy

  const getActiveCreatorId = useCallback(() => {
    const activeUsername = localStorage.getItem('active_username')
    return findActiveCreatorId(activeUsername, crewSnapshotsById, selectedSkipperId)
  }, [crewSnapshotsById, selectedSkipperId])

  const appendQuickEvent = useCallback((
    logbookId: string,
    entryId: string,
    partialEvent: Partial<LogEventPayload>,
    headerPatch?: { departure?: string; destination?: string }
  ) => {
    return apiAppendQuickEvent(
      logbookId,
      entryId,
      { creatorId: getActiveCreatorId(), ...partialEvent },
      headerPatch
    )
  }, [getActiveCreatorId])

  const appendQuickEvents = useCallback((
    logbookId: string,
    entryId: string,
    partialEvents: Partial<LogEventPayload>[]
  ) => {
    const creatorId = getActiveCreatorId()
    const mapped = partialEvents.map((p) => ({ creatorId, ...p }))
    return apiAppendQuickEvents(logbookId, entryId, mapped)
  }, [getActiveCreatorId])

  const appendTankRefill = useCallback((
    logbookId: string,
    entryId: string,
    tank: 'fuel' | 'freshwater',
    addLiters: number,
    event: Partial<LogEventPayload>
  ) => {
    return apiAppendTankRefill(
      logbookId,
      entryId,
      tank,
      addLiters,
      { creatorId: getActiveCreatorId(), ...event }
    )
  }, [getActiveCreatorId])

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
  const hasLoggedPosition = useMemo(
    () => (date ? getLatestLoggedPosition(events, date) != null : false),
    [events, date]
  )
  const voiceMemoLookup = useEntryVoiceMemos(logbookId, entryId)

  const applyLoadedEntry = useCallback((loaded: NonNullable<Awaited<ReturnType<typeof loadEntry>>>) => {
    const entryEvents = (loaded.data.events as LogEventPayload[]) || []
    setDayOfTravel(String(loaded.data.dayOfTravel || ''))
    setDate(String(loaded.data.date || ''))
    setDeparture(String(loaded.data.departure || ''))
    setEvents(sortLogEventsByTime(entryEvents.map((e) => ({ ...e }))))
    setCrewSnapshotsById((loaded.data.crewSnapshotsById as Record<string, any>) || {})
    setSelectedSkipperId(typeof loaded.data.selectedSkipperId === 'string' ? loaded.data.selectedSkipperId : null)
  }, [])

  const refreshEntry = useCallback(async (id: string) => {
    const loaded = await loadEntry(logbookId, id)
    if (!loaded) return
    applyLoadedEntry(loaded)
  }, [logbookId, applyLoadedEntry])

  const showUndo = useCallback((hint: 'event' | 'photo' | 'voice' = 'event') => {
    setUndoHint(hint)
    setUndoVisible(true)
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current)
    undoTimerRef.current = window.setTimeout(() => {
      setUndoVisible(false)
      undoTimerRef.current = null
      undoPhotoIdRef.current = null
      undoVoiceIdRef.current = null
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

      try {
        const { resolveVesselForLogbook } = await import('../services/resolveVessel.js')
        const vessel = await resolveVesselForLogbook(logbookId)
        if (vessel?.sails && Array.isArray(vessel.sails)) {
          setYachtSails(vessel.sails)
        }
      } catch {
        // Vessel profile optional for live log
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
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    void runInit()
    return () => {
      initSeqRef.current += 1
    }
    // Only re-init when the logbook changes — not when i18n `t` identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runInit
  }, [logbookId])

  useEffect(() => {
    if (!loading && entryId) {
      trackPlausibleEvent(PlausibleEvents.LIVE_LOG_OPENED)
    }
  }, [loading, entryId])

  useEffect(() => {
    if (loading || !entryId || !navigator.geolocation) return

    let cancelled = false

    void (async () => {
      const permission = await queryGeolocationPermission()
      if (cancelled) return

      if (permission === 'granted') {
        markGeolocationLiveIntroSeen()
        setGeolocationAccessEpoch((n) => n + 1)
        return
      }

      // Only ask when the browser has not granted location yet (state "prompt").
      if (permission !== 'prompt' || hasSeenGeolocationLiveIntro()) return

      const allow = await showConfirm(
        t('logs.gps_live_intro_body'),
        t('logs.gps_live_intro_title'),
        t('logs.gps_live_intro_allow'),
        t('logs.gps_live_intro_later')
      )
      markGeolocationLiveIntroSeen()
      if (cancelled || !allow) return

      try {
        await getCurrentPosition({
          timeoutMs: 15_000,
          enableHighAccuracy: false,
          maximumAge: 0
        })
        if (!cancelled) setGeolocationAccessEpoch((n) => n + 1)
      } catch (err) {
        const reason = getGeolocationErrorReason(err)
        if (reason === 'permission_denied') {
          await showAlert(
            `${t('logs.gps_permission_denied')}\n\n${t('logs.gps_enable_in_settings_hint')}`,
            t('logs.live_title')
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [loading, entryId, showAlert, showConfirm, t])

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

    let cancelled = false
    let startTimer: number | undefined
    let intervalRef: number | undefined

    const maybeAutoPosition = async () => {
      if (
        cancelled
        || document.visibilityState !== 'visible'
        || autoPositionBusyRef.current
        || busyRef.current
      ) {
        return
      }

      const permission = await queryGeolocationPermission()
      if (cancelled || permission !== 'granted') return

      const lastMs = getLastAutoPositionMs(eventsRef.current, dateRef.current)
      if (lastMs != null && Date.now() - lastMs < AUTO_POSITION_INTERVAL_MS) return

      autoPositionBusyRef.current = true
      try {
        const coords = await getCurrentPosition({
          timeoutMs: 8000,
          enableHighAccuracy: false,
          maximumAge: 120_000
        })
        if (cancelled || busyRef.current) return
        await appendQuickEvent(logbookId, entryId, {
          gpsLat: coords.lat,
          gpsLng: coords.lng,
          remarks: LIVE_EVENT_CODES.AUTO_POSITION
        })
        await refreshEntry(entryId)
      } catch {
        // Best-effort; hint banner shows when no position has been logged yet.
      } finally {
        autoPositionBusyRef.current = false
      }
    }

    void queryGeolocationPermission().then((permission) => {
      if (cancelled || permission !== 'granted') return
      startTimer = window.setTimeout(() => {
        void maybeAutoPosition()
        intervalRef = window.setInterval(() => void maybeAutoPosition(), AUTO_POSITION_CHECK_MS)
      }, AUTO_POSITION_START_DELAY_MS)
    })

    return () => {
      cancelled = true
      if (startTimer !== undefined) window.clearTimeout(startTimer)
      if (intervalRef !== undefined) window.clearInterval(intervalRef)
    }
  }, [entryId, loading, logbookId, refreshEntry, geolocationAccessEpoch])

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
      const permission = await queryGeolocationPermission()
      if (permission === 'granted') {
        const pos = await getCurrentPosition({
          timeoutMs: 8000,
          enableHighAccuracy: false,
          maximumAge: 60_000
        })
        if (pos.speedKn != null) prefill = String(pos.speedKn)
      }
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

  const reportPositionGpsFailure = async (reason: GeolocationErrorReason) => {
    setPositionGpsUnavailable(true)
    setPositionGpsErrorReason(reason)
    setPositionGpsSignal(null)
    await showAlert(gpsFailureAlertBody(t, reason), t('logs.live_position'))
  }

  const openPositionModal = async () => {
    setPositionLat('')
    setPositionLng('')
    setPositionGpsUnavailable(false)
    setPositionGpsErrorReason(null)
    setPositionGpsSignal(null)
    setPositionGpsLoading(true)
    setModal('position')
    try {
      const permission = await queryGeolocationPermission()
      if (permission !== 'granted') {
        const reason = permission === 'denied' ? 'permission_denied' : 'unavailable'
        await reportPositionGpsFailure(reason)
        return
      }
      const coords = await getCurrentPosition({
        timeoutMs: 10_000,
        enableHighAccuracy: false,
        maximumAge: 60_000
      })
      setPositionLat(coords.lat)
      setPositionLng(coords.lng)
      setPositionGpsSignal({ quality: coords.signalQuality, accuracyM: coords.accuracyM })
    } catch (err) {
      await reportPositionGpsFailure(getGeolocationErrorReason(err))
    } finally {
      setPositionGpsLoading(false)
    }
  }

  const retryPositionGps = async () => {
    setPositionGpsLoading(true)
    setPositionGpsUnavailable(false)
    setPositionGpsErrorReason(null)
    setPositionGpsSignal(null)
    try {
      const permission = await queryGeolocationPermission()
      if (permission !== 'granted') {
        const reason = permission === 'denied' ? 'permission_denied' : 'unavailable'
        await reportPositionGpsFailure(reason)
        return
      }
      const coords = await getCurrentPosition({
        timeoutMs: 10_000,
        enableHighAccuracy: false,
        maximumAge: 60_000
      })
      setPositionLat(coords.lat)
      setPositionLng(coords.lng)
      setPositionGpsUnavailable(false)
      setPositionGpsSignal({ quality: coords.signalQuality, accuracyM: coords.accuracyM })
    } catch (err) {
      await reportPositionGpsFailure(getGeolocationErrorReason(err))
    } finally {
      setPositionGpsLoading(false)
    }
  }

  const confirmPosition = () => {
    const coords = normalizeGpsCoordinates(positionLat, positionLng)
    if (!coords) {
      void showAlert(t('logs.live_position_invalid'), t('logs.live_position'))
      return
    }
    setModal('none')
    void runQuickAction(async () => {
      if (!entryId) return false
      await appendQuickEvent(logbookId, entryId, {
        gpsLat: coords.lat,
        gpsLng: coords.lng,
        remarks: LIVE_EVENT_CODES.POSITION
      })
    }, 'position')
  }

  const handleFetchOwmWeather = () => {
    if (!entryId || busy || weatherOwmLoading) return
    if (!isOnline) {
      void showAlert(t('logs.weather_offline'), t('logs.live_weather_owm_btn'))
      return
    }

    const position = getLastLoggedPositionWithin(
      events,
      date,
      LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS
    )
    if (!position) {
      const latest = getLatestLoggedPosition(events, date)
      void showAlert(
        latest
          ? t('logs.live_weather_position_stale')
          : t('logs.live_weather_position_required'),
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
          data = await fetchOpenWeatherCurrent(
            { lat, lon: lng },
            { analyticsSource: 'live_log' }
          )
        } catch (err) {
          if (err instanceof WeatherApiError) {
            if (err.code === 'OFFLINE') {
              void showAlert(t('logs.weather_offline'), t('logs.live_weather_owm_btn'))
              return
            }
            if (err.code === 'NO_KEY') {
              void showAlert(t('settings.no_key'), t('logs.live_weather_owm_btn'))
              return
            }
            if (err.code === 'UNAUTHORIZED') {
              void showAlert(t('settings.weather_unauthorized'), t('logs.live_weather_owm_btn'))
              return
            }
            if (err.code === 'NOT_FOUND') {
              void showAlert(t('settings.weather_not_found'), t('logs.live_weather_owm_btn'))
              return
            }
            if (err.code === 'BAD_REQUEST') {
              void showAlert(t('settings.weather_bad_request'), t('logs.live_weather_owm_btn'))
              return
            }
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
        if (parsed.visibility) {
          partials.push({
            visibility: parsed.visibility,
            remarks: LIVE_EVENT_CODES.VISIBILITY
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
      } catch (err: unknown) {
        console.error('Live log OWM weather save failed:', err)
        setError(err instanceof Error ? err.message : t('logs.live_action_error'))
      } finally {
        setWeatherOwmLoading(false)
      }
    })()
  }

  const handleFetchTides = () => {
    if (!entryId || busy || tidesLoading) return
    if (!isOnline) {
      void showAlert(t('logs.weather_offline'), t('logs.tides'))
      return
    }

    setTidesLoading(true)
    setError(null)
    void (async () => {
      try {
        const loaded = await loadEntry(logbookId, entryId)
        const eventsForLocation = loaded
          ? sortLogEventsByTime((loaded.data.events as LogEventPayload[]) || [])
          : events
        const entryDateForLocation = loaded ? String(loaded.data.date || date) : date
        const departureForLocation = loaded ? String(loaded.data.departure || departure) : departure

        const location = resolveTideFetchLocation({
          events: eventsForLocation,
          entryDate: entryDateForLocation,
          departure: departureForLocation
        })
        if ('error' in location) {
          void showAlert(
            location.error === 'stale'
              ? t('logs.tide_position_stale')
              : t('logs.tide_location_required'),
            t('logs.tides')
          )
          return
        }

        const data =
          location.mode === 'nearby'
            ? await fetchTidesNearby(location.lat, location.lng, {
                analyticsSource: 'live_log',
                locationSource: location.source
              })
            : await fetchTidesByPlace(location.query, { analyticsSource: 'live_log' })

        const parsed = parseTideTurtleForDate(data, date)
        if (!parsed.highWater && !parsed.lowWater) {
          void showAlert(t('logs.tide_no_data'), t('logs.tides'))
          return
        }

        setTidePreview({
          highWater: parsed.highWater,
          lowWater: parsed.lowWater,
          location: buildTideLocationMeta(location, data)
        })
        setModal('tides')
      } catch (err) {
        if (err instanceof TidesApiError) {
          if (err.code === 'OFFLINE') {
            void showAlert(t('logs.weather_offline'), t('logs.tides'))
            return
          }
          if (err.code === 'PLACE_NOT_FOUND') {
            void showAlert(t('logs.tide_place_not_found', { place: departure.trim() }), t('logs.tides'))
            return
          }
          if (err.code === 'NOT_FOUND') {
            void showAlert(t('logs.tide_no_data'), t('logs.tides'))
            return
          }
        }
        console.error('Live log tide fetch failed:', err)
        void showAlert(t('logs.tide_fetch_failed'), t('logs.tides'))
      } finally {
        setTidesLoading(false)
      }
    })()
  }

  const confirmTides = () => {
    if (!entryId || !tidePreview || busy) return
    const preview = tidePreview
    void runQuickAction(async () => {
      await patchEntryTides(logbookId, entryId, {
        highWater: preview.highWater,
        lowWater: preview.lowWater,
        ...preview.location
      })
      setTidePreview(null)
      setModal('none')
      void showAlert(
        t('logs.tide_applied_success', {
          highWater: preview.highWater || '—',
          lowWater: preview.lowWater || '—'
        }),
        t('logs.tides')
      )
    }, 'tides', false)
  }

  const handleUndo = () => {
    if (!entryId || busy) return
    const photoId = undoPhotoIdRef.current
    const voiceId = undoVoiceIdRef.current
    setUndoVisible(false)
    undoPhotoIdRef.current = null
    undoVoiceIdRef.current = null
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    void runQuickAction(async () => {
      if (photoId) {
        await deleteEntryPhoto(logbookId, photoId)
      }
      if (voiceId) {
        await deleteEntryVoiceMemo(logbookId, voiceId)
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

  const openVoiceModal = () => {
    setVoiceCaption('')
    setModal('voice')
  }

  const closeVoiceModal = () => {
    if (voiceSaving) return
    setModal('none')
    setVoiceCaption('')
  }

  const handleVoiceSave = (blob: Blob, mimeType: string, durationSec: number) => {
    if (!entryId || voiceSaving) return
    const caption = voiceCaption.trim()
    setVoiceSaving(true)
    void (async () => {
      try {
        const audioDataUrl = await blobToAudioDataUrl(blob)
        const authorized = getAiAuthorized()
        let transcriptionText = ''
        let transcribed = true
        let transcriptionError = false

        if (authorized) {
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 4000)

            const res = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioDataUrl }),
              signal: controller.signal
            })
            clearTimeout(timeoutId)
            if (!res.ok) throw new Error(`Status ${res.status}`)
            const data = await res.json()
            transcriptionText = (data.text || '').trim()
          } catch (err) {
            console.warn('[LiveLogView] Automatic transcription failed or timed out:', err)
            transcriptionError = true
            transcribed = false
          }
        } else {
          transcribed = false
        }

        let finalCaption = caption
        if (transcriptionText) {
          finalCaption = caption
            ? `${caption}\n(Transkript: ${transcriptionText})`
            : transcriptionText
        }

        const voiceId = await saveEntryVoiceMemo({
          logbookId,
          entryId,
          audioDataUrl,
          mimeType,
          durationSec,
          caption: finalCaption,
          transcribed,
          analyticsContext: 'live_log'
        })
        await appendQuickEvent(logbookId, entryId, {
          remarks: liveVoiceRemark(voiceId)
        })
        await refreshEntry(entryId)
        undoVoiceIdRef.current = voiceId
        setModal('none')
        setVoiceCaption('')
        showUndo('voice')
        trackPlausibleEvent(PlausibleEvents.LIVE_LOG_EVENT_LOGGED, { action: 'voice' })
        if (transcriptionError) {
          trackPlausibleEvent(PlausibleEvents.VOICE_MEMO_TRANSCRIBED, {
            status: 'failed',
            mode: 'auto'
          })
          void showAlert(t('logs.live_voice_transcribe_failed'), t('logs.live_voice_btn'))
        } else if (authorized) {
          trackPlausibleEvent(PlausibleEvents.VOICE_MEMO_TRANSCRIBED, {
            status: 'success',
            mode: 'auto'
          })
        } else {
          void showAlert(
            t('profile.ai_unauthorized_alert_desc'),
            t('profile.ai_unauthorized_alert_title')
          )
        }
      } catch (err: unknown) {
        console.error('Live log voice save failed:', err)
        const msg = err instanceof Error && err.message === 'VOICE_MEMO_TOO_LARGE'
          ? t('logs.live_voice_too_large')
          : err instanceof Error
            ? err.message
            : t('logs.live_voice_error')
        void showAlert(msg, t('logs.live_voice_btn'))
      } finally {
        setVoiceSaving(false)
      }
    })()
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
      case 'visibility':
        if (!primary) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            visibility: primary,
            remarks: LIVE_EVENT_CODES.VISIBILITY
          })
        }, 'visibility')
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
        const liters = parseAppDecimal(primary)
        if (liters == null || liters <= 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendTankRefill(logbookId, entryId, 'fuel', liters, {
            remarks: liveFuelRemark(formatTankLiters(liters))
          })
        }, 'fuel')
        break
      }
      case 'water': {
        const liters = parseAppDecimal(primary)
        if (liters == null || liters <= 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendTankRefill(logbookId, entryId, 'freshwater', liters, {
            remarks: liveWaterRemark(formatTankLiters(liters))
          })
        }, 'water')
        break
      }
      case 'sog': {
        const speedKn = parseAppDecimal(primary)
        if (speedKn == null || speedKn < 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            remarks: liveSogRemark(formatSpeedKn(speedKn))
          })
        }, 'sog')
        break
      }
      case 'stw': {
        const speedKn = parseAppDecimal(primary)
        if (speedKn == null || speedKn < 0) return
        setModal('none')
        void runQuickAction(async () => {
          await appendQuickEvent(logbookId, entryId, {
            remarks: liveStwRemark(formatSpeedKn(speedKn))
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
    <div className="live-log-card">
      <div className="section-title-bar mb-4">
        <div className="form-header" style={{ margin: 0 }}>
          <Radio size={24} className="form-icon" />
          <div>
            <h2>{t('logs.live_title')}</h2>
            {date && (
              <p className="live-log-subtitle">
                {t('logs.travel_day_number', { number: dayOfTravel })} · {new Date(date).toLocaleDateString()}
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

      {!hasLoggedPosition && (
        <p className="live-log-gps-hint" role="status">
          <MapPin size={16} aria-hidden />
          {t('logs.live_gps_start_hint')}
        </p>
      )}

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
                <button type="button" className="live-log-subaction-btn" onClick={() => openValueModal('visibility')} disabled={busy}>
                  {t('logs.live_visibility_btn')}
                </button>
              </div>
            )}
          </div>

          <button type="button" className="live-log-action-btn" onClick={() => void openPositionModal()} disabled={busy}>
            <MapPin size={18} />
            {t('logs.live_position')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={handleFetchTides} disabled={busy || tidesLoading}>
            <Waves size={18} />
            {tidesLoading ? t('logs.tide_fetch_loading') : t('logs.tides')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={() => { setCommentText(''); setModal('comment') }} disabled={busy}>
            <MessageSquare size={18} />
            {t('logs.live_comment_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={openPhotoModal} disabled={busy || photoSaving}>
            <Camera size={18} />
            {t('logs.live_photo_btn')}
          </button>
          <button type="button" className="live-log-action-btn" onClick={openVoiceModal} disabled={busy || voiceSaving}>
            <Mic size={18} />
            {t('logs.live_voice_btn')}
          </button>
        </aside>

        <section className="live-log-stream-panel" aria-label={t('logs.live_stream_label')}>
          <h3 className="live-log-stream-title">{t('logs.live_stream_title')}</h3>
          {events.length === 0 ? (
            <p className="live-log-empty">{t('logs.live_no_events')}</p>
          ) : (
            <ol className="live-log-stream">
              {events.map((event, index) => {
                return (
                  <li key={`${event.time}-${index}`} className="live-log-entry">
                    <time className="live-log-time">{event.time}</time>
                    <CreatorAvatar
                      creatorId={event.creatorId}
                      crewSnapshotsById={crewSnapshotsById}
                      size={24}
                    />
                    <div className="live-log-summary-block">
                      <EventRemarksCell
                        event={event}
                        logbookId={logbookId}
                        voiceMemoLookup={voiceMemoLookup}
                        readOnly={false}
                      />
                    </div>
                  </li>
                )
              })}
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
              {undoHint === 'photo'
                ? t('logs.live_undo_photo_hint')
                : undoHint === 'voice'
                  ? t('logs.live_undo_voice_hint')
                  : t('logs.live_undo_hint')}
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
              <button type="button" className="btn secondary" onClick={closeModal}>{t('logs.live_cancel')}</button>
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

      {modal === 'position' && (
        <div
          className="live-log-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="live-log-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.live_position')}</h3>
            {positionGpsUnavailable && (
              <>
                {positionGpsErrorReason && (
                  <p className="live-log-modal-hint live-log-gps-error-modal" role="alert">
                    {t(geolocationErrorI18nKey(positionGpsErrorReason))}
                  </p>
                )}
                <p className="live-log-modal-hint">{t('logs.live_position_manual_hint')}</p>
              </>
            )}
            <fieldset className="live-log-position-coords" disabled={busy}>
              <legend className="live-log-position-label">{t('logs.event_gps')}</legend>
              <div className="live-log-position-coords-row">
                <label className="live-log-position-field">
                  <span className="live-log-position-field-label">{t('logs.live_position_lat_placeholder')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-text"
                    placeholder="54.123456"
                    value={positionLat}
                    onChange={(e) => { setPositionGpsSignal(null); setPositionLat(e.target.value) }}
                    autoFocus
                  />
                </label>
                <label className="live-log-position-field">
                  <span className="live-log-position-field-label">{t('logs.live_position_lng_placeholder')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-text"
                    placeholder="10.654321"
                    value={positionLng}
                    onChange={(e) => { setPositionGpsSignal(null); setPositionLng(e.target.value) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmPosition() }}
                  />
                </label>
              </div>
              {positionGpsSignal && (
                <GpsSignalHint
                  quality={positionGpsSignal.quality}
                  accuracyM={positionGpsSignal.accuracyM}
                  className="gps-signal-hint-modal"
                />
              )}
              <div className="live-log-position-gps-row">
                <button
                  type="button"
                  className="btn secondary live-log-position-gps-btn"
                  onClick={() => void retryPositionGps()}
                  title={t('logs.gps_btn')}
                  disabled={positionGpsLoading}
                  aria-label={t('logs.gps_btn')}
                >
                  <MapPin size={16} />
                  <span>{positionGpsLoading ? t('logs.live_position_gps_loading') : t('logs.gps_btn')}</span>
                </button>
              </div>
            </fieldset>
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={closeModal}>{t('logs.live_cancel')}</button>
              <button
                type="button"
                className="btn primary"
                onClick={confirmPosition}
                disabled={busy || !normalizeGpsCoordinates(positionLat, positionLng)}
              >
                {t('logs.live_sails_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'tides' && tidePreview && (
        <div
          className="live-log-modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="live-log-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('logs.tides')}</h3>
            <p className="live-log-modal-hint" role="note">
              {t('logs.tide_disclaimer')}
            </p>
            {formatTideLocationLabel(tidePreview.location, t) ? (
              <p className="live-log-modal-hint" role="status">
                {formatTideLocationLabel(tidePreview.location, t)}
              </p>
            ) : null}
            <dl className="live-log-tide-preview">
              <div>
                <dt>{t('logs.tide_high_water')}</dt>
                <dd>{tidePreview.highWater || '—'}</dd>
              </div>
              <div>
                <dt>{t('logs.tide_low_water')}</dt>
                <dd>{tidePreview.lowWater || '—'}</dd>
              </div>
            </dl>
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={closeModal}>{t('logs.live_cancel')}</button>
              <button type="button" className="btn primary" onClick={confirmTides} disabled={busy}>
                {t('logs.tide_apply')}
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
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.live_cancel')}</button>
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
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.live_cancel')}</button>
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
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.live_cancel')}</button>
              <button type="button" className="btn primary" onClick={confirmValueModal}>{t('logs.live_sails_confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {['pressure', 'temp', 'precip', 'sea_state', 'visibility', 'fuel', 'water', 'sog', 'stw'].includes(modal) && (
        <div className="live-log-modal-backdrop" onClick={() => setModal('none')}>
          <div className="live-log-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {modal === 'pressure' && t('logs.live_pressure_btn')}
              {modal === 'temp' && t('logs.live_temp_btn')}
              {modal === 'precip' && t('logs.live_precip_btn')}
              {modal === 'sea_state' && t('logs.live_sea_state_btn')}
              {modal === 'visibility' && t('logs.live_visibility_btn')}
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
                        : modal === 'visibility' ? t('logs.live_visibility_placeholder')
                          : modal === 'fuel' ? t('logs.live_fuel_placeholder')
                          : modal === 'water' ? t('logs.live_water_placeholder')
                            : modal === 'sog' ? t('logs.live_sog_placeholder')
                              : t('logs.live_stw_placeholder')
              }
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmValueModal() }}
            />
            <div className="live-log-modal-actions">
              <button type="button" className="btn secondary" onClick={() => setModal('none')}>{t('logs.live_cancel')}</button>
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

      <LiveVoiceCapture
        open={modal === 'voice'}
        busy={voiceSaving}
        caption={voiceCaption}
        onCaptionChange={setVoiceCaption}
        onClose={closeVoiceModal}
        onSave={handleVoiceSave}
      />
      </>,
      document.body
    )}
    </>
  )
}
