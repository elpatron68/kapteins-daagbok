import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { saveEntryDraft, clearEntryDraft } from '../services/entryDraft.js'
import { getErrorMessage } from '../utils/errors.js'
import { downloadLogbookPagePdf } from '../services/pdfExport.js'
import { FileText, Save, ChevronLeft, Check, Compass, Plus, Trash2, MapPin, CloudSun, Clock, Download, Upload, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react'
import PhotoCapture from './PhotoCapture.tsx'
import SignatureSection from './SignatureSection.tsx'
import EntryCrewSection from './EntryCrewSection.tsx'
import { emptyEntryCrewFields, type EntryCrewFields } from '../types/person.js'
import { entryCrewFromPreviousEntry } from '../utils/personSnapshots.js'
import TrackMap from './TrackMap.tsx'
import { useDialog } from './ModalDialog.tsx'
import {
  normalizeSignature,
  fingerprintSignature,
  normalizedSerializedSignature,
  isPasskeySignature,
  isClassicSignature,
  createClassicSignature,
  isSignatureValidForEntry,
  hasAnySignature
} from '../utils/signatures.js'
import type { SignatureValue } from '../types/signatures.js'
import { buildLogEntryPayload, sortLogEventsByTime, normalizeLogEvent, hasUnsavedEventDraft, currentLocalTimeHHMM, isValidTimeHHMM, type LogEventPayload } from '../utils/logEntryPayload.js'
import EventTimeInput24h from './EventTimeInput24h.tsx'
import CourseDialInput from './CourseDialInput.tsx'
import { parseOwmCurrentWeather } from '../utils/openWeatherMap.js'
import { hashEntryForSigning } from '../utils/entryCanonicalHash.js'
import { signLogEntry } from '../services/entrySigning.js'
import { putEntryRecord } from '../utils/entryListCache.js'
import { getLogbookAccess } from '../services/logbookAccess.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { fetchOpenWeatherCurrent, WeatherApiError } from '../services/weather.js'
import {
  getDecryptedTrack,
  saveUploadedTrack,
  deleteTrack,
  downloadTrackFile,
  parseTrackFile,
  type SavedTrack,
  type TrackWaypoint
} from '../services/trackUpload.js'
import NmeaImportWizard from './NmeaImportWizard.tsx'
import {
  deleteNmeaArchive,
  downloadNmeaArchive,
  getNmeaArchive,
  type NmeaArchiveRecord
} from '../services/nmeaArchive.js'
import { computeTrackStats, formatTrackStats } from '../utils/trackStats.js'
import { computeFuelPerMotorHour, formatFuelPerMotorHour } from '../utils/fuelStats.js'
import { useRegisterUnsavedChanges } from '../context/UnsavedChangesContext.tsx'
import TankLiterInput from './TankLiterInput.tsx'
import MetricRangeInput from './MetricRangeInput.tsx'
import {
  formatHeelDeg,
  formatPressureHpa,
  formatSeaState,
  formatVisibilityMeters,
  HEEL_MAX_DEG,
  HEEL_MIN_DEG,
  parseHeelDeg,
  parsePressureHpa,
  parseSeaState,
  parseVisibilityMeters,
  PRESSURE_DEFAULT_HPA,
  PRESSURE_MAX_HPA,
  PRESSURE_MIN_HPA,
  SEA_STATE_MAX,
  SEA_STATE_MIN,
  VISIBILITY_STEPS_M
} from '../utils/weatherMetrics.js'
import {
  computeEveningTankMaxLiters,
  computeRefilledTankMaxLiters,
  extractTankCapacitiesFromYacht,
  formatTankLitersForInput,
  type VesselTankCapacities
} from '../utils/tankCapacity.js'

function emptyTankLevels() {
  return { morning: 0, refilled: 0, evening: 0, consumption: 0 }
}

function fingerprintFromStoredEntry(decrypted: Record<string, unknown>): string {
  const fw = (decrypted.freshwater as Record<string, number> | undefined) ?? emptyTankLevels()
  const fuel = (decrypted.fuel as Record<string, number> | undefined) ?? emptyTankLevels()
  const gw = decrypted.greywater as { level?: number } | undefined
  const trackDistance = decrypted.trackDistanceNm
  const trackSpeedMax = decrypted.trackSpeedMaxKn
  const trackSpeedAvg = decrypted.trackSpeedAvgKn
  const motorHoursRaw = decrypted.motorHours

  const payload = buildLogEntryPayload({
    date: String(decrypted.date || ''),
    dayOfTravel: String(decrypted.dayOfTravel || ''),
    departure: String(decrypted.departure || ''),
    destination: String(decrypted.destination || ''),
    freshwater: {
      morning: fw.morning || 0,
      refilled: fw.refilled || 0,
      evening: fw.evening || 0,
      consumption: fw.consumption ?? 0
    },
    fuel: {
      morning: fuel.morning || 0,
      refilled: fuel.refilled || 0,
      evening: fuel.evening || 0,
      consumption: fuel.consumption ?? 0
    },
    greywater: gw ? { level: gw.level || 0 } : undefined,
    trackDistanceNm:
      trackDistance != null && trackDistance !== ''
        ? parseFloat(String(trackDistance))
        : undefined,
    trackSpeedMaxKn:
      trackSpeedMax != null && trackSpeedMax !== ''
        ? parseFloat(String(trackSpeedMax))
        : undefined,
    trackSpeedAvgKn:
      trackSpeedAvg != null && trackSpeedAvg !== ''
        ? parseFloat(String(trackSpeedAvg))
        : undefined,
    motorHours:
      motorHoursRaw != null && motorHoursRaw !== ''
        ? parseFloat(String(motorHoursRaw))
        : undefined,
    events: (decrypted.events as LogEventPayload[]) || [],
    entryCrew: entryCrewFromPreviousEntry(decrypted as Record<string, unknown>)
  })

  return JSON.stringify({
    ...payload,
    signSkipper: fingerprintSignature(decrypted.signSkipper),
    signCrew: fingerprintSignature(decrypted.signCrew)
  })
}

interface LogEntryEditorProps {
  entryId: string
  logbookId: string
  onBack: () => void
  readOnly?: boolean
  preloadedEntry?: any
  preloadedPhotos?: any[]
  preloadedTrack?: any
  preloadedYacht?: any
}

interface LogEvent extends LogEventPayload {}

export default function LogEntryEditor({
  entryId,
  logbookId,
  onBack,
  readOnly = false,
  preloadedEntry,
  preloadedPhotos,
  preloadedTrack,
  preloadedYacht
}: LogEntryEditorProps) {
  const { t, i18n } = useTranslation()
  const { showAlert, showConfirm } = useDialog()
  const showAlertRef = useRef(showAlert)
  showAlertRef.current = showAlert

  // General details state
  const [date, setDate] = useState('')
  const [dayOfTravel, setDayOfTravel] = useState('')
  const [yachtSails, setYachtSails] = useState<string[]>([])
  const [departure, setDeparture] = useState('')
  const [destination, setDestination] = useState('')

  // Freshwater state
  const [fwMorning, setFwMorning] = useState('0')
  const [fwRefilled, setFwRefilled] = useState('0')
  const [fwEvening, setFwEvening] = useState('0')
  const [fwConsumption, setFwConsumption] = useState('0')

  // Fuel state
  const [fuelMorning, setFuelMorning] = useState('0')
  const [fuelRefilled, setFuelRefilled] = useState('0')
  const [fuelEvening, setFuelEvening] = useState('0')
  const [fuelConsumption, setFuelConsumption] = useState('0')

  const [greywaterLevel, setGreywaterLevel] = useState('0')
  const [tankCapacities, setTankCapacities] = useState<VesselTankCapacities>({})

  const [entryCrew, setEntryCrew] = useState<EntryCrewFields>(emptyEntryCrewFields())

  // Signatures
  const [signSkipper, setSignSkipper] = useState<SignatureValue | ''>('')
  const [signCrew, setSignCrew] = useState<SignatureValue | ''>('')
  const [canSignSkipper, setCanSignSkipper] = useState(false)
  const [canSignCrew, setCanSignCrew] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [entryHash, setEntryHash] = useState('')

  // GPS track stats (from uploaded track)
  const [trackDistanceNm, setTrackDistanceNm] = useState('')
  const [trackSpeedMaxKn, setTrackSpeedMaxKn] = useState('')
  const [trackSpeedAvgKn, setTrackSpeedAvgKn] = useState('')

  // Motor hours under engine propulsion (per travel day)
  const [motorHours, setMotorHours] = useState('')

  // Events list state
  const [events, setEvents] = useState<LogEvent[]>([])

  // Add Event Form State
  const [evTime, setEvTime] = useState(() => currentLocalTimeHHMM())
  const [evMgk, setEvMgk] = useState('')
  const [evRwk, setEvRwk] = useState('')
  const [evWindPressure, setEvWindPressure] = useState('')
  const [evWindDirection, setEvWindDirection] = useState('')
  const [evWindStrength, setEvWindStrength] = useState('')
  const [evSeaState, setEvSeaState] = useState('')
  const [evVisibility, setEvVisibility] = useState('')
  const [evWeatherIcon, setEvWeatherIcon] = useState('')
  const [evCurrent, setEvCurrent] = useState('')
  const [evHeel, setEvHeel] = useState('')
  const [evSailsOrMotor, setEvSailsOrMotor] = useState('')
  const [sailsPickerExpanded, setSailsPickerExpanded] = useState(false)
  const [evLogReading, setEvLogReading] = useState('')
  const [evDistance, setEvDistance] = useState('')
  const [evGpsLat, setEvGpsLat] = useState('')
  const [evGpsLng, setEvGpsLng] = useState('')
  const [evRemarks, setEvRemarks] = useState('')
  const [evLocationName, setEvLocationName] = useState('')
  const [activeCourseTab, setActiveCourseTab] = useState<'mgk' | 'rwk'>('mgk')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null)

  // Track file upload
  const [savedTrack, setSavedTrack] = useState<SavedTrack | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [nmeaWizardOpen, setNmeaWizardOpen] = useState(false)
  const [nmeaArchive, setNmeaArchive] = useState<NmeaArchiveRecord | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lockedContentHashRef = useRef<string | null>(null)
  const contentReadyRef = useRef(false)
  const lastSignatureAlertHashRef = useRef<string | null>(null)
  const skipCrewSignClearRef = useRef(false)
  const entryHashSeqRef = useRef(0)
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null)

  const applyTrackStats = (waypoints: SavedTrack['waypoints']) => {
    const stats = computeTrackStats(waypoints)
    if (!stats) return
    const formatted = formatTrackStats(stats)
    setTrackDistanceNm(formatted.distanceNm)
    setTrackSpeedMaxKn(formatted.speedMaxKn)
    setTrackSpeedAvgKn(formatted.speedAvgKn)
  }

  const loadTrackStatsFromEntry = (entry: any) => {
    if (entry?.trackDistanceNm != null && entry.trackDistanceNm !== '') {
      setTrackDistanceNm(String(entry.trackDistanceNm))
    }
    if (entry?.trackSpeedMaxKn != null && entry.trackSpeedMaxKn !== '') {
      setTrackSpeedMaxKn(String(entry.trackSpeedMaxKn))
    }
    if (entry?.trackSpeedAvgKn != null && entry.trackSpeedAvgKn !== '') {
      setTrackSpeedAvgKn(String(entry.trackSpeedAvgKn))
    }
    if (entry?.motorHours != null && entry.motorHours !== '') {
      setMotorHours(String(entry.motorHours))
    } else {
      setMotorHours('')
    }
  }

  const buildPayloadForSigning = useCallback((eventsOverride?: LogEvent[]) => {
    return buildLogEntryPayload({
      date,
      dayOfTravel,
      departure,
      destination,
      freshwater: {
        morning: parseFloat(fwMorning) || 0,
        refilled: parseFloat(fwRefilled) || 0,
        evening: parseFloat(fwEvening) || 0,
        consumption: parseFloat(fwConsumption) || 0
      },
      fuel: {
        morning: parseFloat(fuelMorning) || 0,
        refilled: parseFloat(fuelRefilled) || 0,
        evening: parseFloat(fuelEvening) || 0,
        consumption: parseFloat(fuelConsumption) || 0
      },
      greywater: { level: parseFloat(greywaterLevel) || 0 },
      trackDistanceNm: trackDistanceNm.trim() ? parseFloat(trackDistanceNm) : undefined,
      trackSpeedMaxKn: trackSpeedMaxKn.trim() ? parseFloat(trackSpeedMaxKn) : undefined,
      trackSpeedAvgKn: trackSpeedAvgKn.trim() ? parseFloat(trackSpeedAvgKn) : undefined,
      motorHours: motorHours.trim() ? parseFloat(motorHours) : undefined,
      events: eventsOverride ?? events,
      entryCrew
    })
  }, [
    date, dayOfTravel, departure, destination,
    fwMorning, fwRefilled, fwEvening, fwConsumption,
    fuelMorning, fuelRefilled, fuelEvening, fuelConsumption,
    greywaterLevel,
    trackDistanceNm, trackSpeedMaxKn, trackSpeedAvgKn, motorHours,
    events,
    entryCrew
  ])

  useEffect(() => {
    if (readOnly || loading || !date) return
    const timer = window.setTimeout(() => {
      void saveEntryDraft(logbookId, entryId, buildPayloadForSigning())
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [readOnly, loading, logbookId, entryId, buildPayloadForSigning, date])

  const fuelPerMotorHour = useMemo(
    () => computeFuelPerMotorHour(parseFloat(fuelConsumption) || 0, parseFloat(motorHours) || 0),
    [fuelConsumption, motorHours]
  )

  const tankCapacityTooltip = t('logs.tank_capacity_tooltip')

  const fwRefilledMax = useMemo(
    () => computeRefilledTankMaxLiters(fwMorning, tankCapacities.freshwaterCapacityL),
    [fwMorning, tankCapacities.freshwaterCapacityL]
  )

  const fwEveningMax = useMemo(
    () =>
      computeEveningTankMaxLiters(
        fwMorning,
        fwRefilled,
        tankCapacities.freshwaterCapacityL
      ),
    [fwMorning, fwRefilled, tankCapacities.freshwaterCapacityL]
  )

  const fuelRefilledMax = useMemo(
    () => computeRefilledTankMaxLiters(fuelMorning, tankCapacities.fuelCapacityL),
    [fuelMorning, tankCapacities.fuelCapacityL]
  )

  const fuelEveningMax = useMemo(
    () =>
      computeEveningTankMaxLiters(
        fuelMorning,
        fuelRefilled,
        tankCapacities.fuelCapacityL
      ),
    [fuelMorning, fuelRefilled, tankCapacities.fuelCapacityL]
  )

  const currentFingerprint = useMemo(() => {
    const payload = buildPayloadForSigning()
    return JSON.stringify({
      ...payload,
      signSkipper: fingerprintSignature(signSkipper),
      signCrew: fingerprintSignature(signCrew)
    })
  }, [buildPayloadForSigning, signSkipper, signCrew])

  const buildEventFromForm = (): LogEvent =>
    normalizeLogEvent({
      time: evTime,
      mgk: evMgk,
      rwk: evRwk,
      windPressure: evWindPressure,
      windDirection: evWindDirection,
      windStrength: evWindStrength,
      seaState: evSeaState,
      visibility: evVisibility,
      weatherIcon: evWeatherIcon,
      current: evCurrent,
      heel: evHeel,
      sailsOrMotor: evSailsOrMotor,
      logReading: evLogReading,
      distance: evDistance,
      gpsLat: evGpsLat,
      gpsLng: evGpsLng,
      remarks: evRemarks
    })

  const applyEventFormToEvents = (eventData: LogEvent): LogEvent[] => {
    if (editingEventIndex !== null) {
      return sortLogEventsByTime(events.map((ev, idx) => (idx === editingEventIndex ? eventData : ev)))
    }
    return sortLogEventsByTime([...events, eventData])
  }

  const hasPendingEventForm = useMemo(() => {
    return hasUnsavedEventDraft(buildEventFromForm(), editingEventIndex, events)
  }, [
    evTime, evMgk, evRwk, evWindPressure, evWindDirection, evWindStrength, evSeaState,
    evVisibility, evWeatherIcon, evCurrent, evHeel, evSailsOrMotor, evLogReading, evDistance,
    evGpsLat, evGpsLng, evRemarks, editingEventIndex, events
  ])

  const isDirty = savedFingerprint !== null && (
    currentFingerprint !== savedFingerprint || hasPendingEventForm
  )

  const saveBeforeLeaveRef = useRef<(() => Promise<void>) | null>(null)
  const invokeSaveBeforeLeave = useCallback(async () => {
    if (saveBeforeLeaveRef.current) await saveBeforeLeaveRef.current()
  }, [])

  const { confirmLeave } = useRegisterUnsavedChanges(
    `log-entry-${entryId}`,
    !readOnly && !loading && isDirty,
    invokeSaveBeforeLeave
  )

  const handleBack = async () => {
    if (!(await confirmLeave())) return
    onBack()
  }

  const persistEntryToDb = useCallback(async (
    options?: LogEvent[] | {
      eventsOverride?: LogEvent[]
      signSkipper?: SignatureValue | ''
      signCrew?: SignatureValue | ''
    }
  ) => {
    if (readOnly) return

    const normalized = Array.isArray(options) ? { eventsOverride: options } : (options ?? {})
    const eventsOverride = normalized.eventsOverride
    const skipperToSave = normalized.signSkipper !== undefined ? normalized.signSkipper : signSkipper
    const crewToSave = normalized.signCrew !== undefined ? normalized.signCrew : signCrew

    const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
    if (!masterKey) throw new Error('Encryption key not found. Please log in.')

    const entryData = {
      ...buildPayloadForSigning(eventsOverride),
      signSkipper: normalizedSerializedSignature(skipperToSave),
      signCrew: normalizedSerializedSignature(crewToSave)
    }

    const encrypted = await encryptJson(entryData, masterKey)
    const now = new Date().toISOString()

    await putEntryRecord(
      {
        payloadId: entryId,
        logbookId,
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: now
      },
      entryData
    )

    await db.syncQueue.put({
      action: 'update',
      type: 'entry',
      payloadId: entryId,
      logbookId,
      data: JSON.stringify(encrypted),
      updatedAt: now
    })

    syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))

    setSavedFingerprint(JSON.stringify({
      ...buildPayloadForSigning(eventsOverride),
      signSkipper: fingerprintSignature(skipperToSave),
      signCrew: fingerprintSignature(crewToSave)
    }))

    const hash = await hashEntryForSigning(buildPayloadForSigning(eventsOverride))
    entryHashSeqRef.current += 1
    setEntryHash(hash)
    lockedContentHashRef.current = hasAnySignature(skipperToSave, crewToSave) ? hash : null
  }, [
    readOnly, logbookId, entryId, events, buildPayloadForSigning, signSkipper, signCrew
  ])

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
    getLogbookAccess(logbookId).then((access) => {
      if (!access) return
      setCanSignSkipper(access.isOwner)
      setCanSignCrew(
        access.role === 'WRITE' ||
        (access.isOwner && access.writeCollaboratorCount === 0)
      )
    })
  }, [logbookId])

  useEffect(() => {
    const seq = ++entryHashSeqRef.current
    let cancelled = false
    hashEntryForSigning(buildPayloadForSigning()).then((hash) => {
      if (cancelled || seq !== entryHashSeqRef.current) return
      setEntryHash(hash)
    })
    return () => { cancelled = true }
  }, [buildPayloadForSigning])

  useEffect(() => {
    contentReadyRef.current = false
    if (loading) return
    const timer = window.setTimeout(() => {
      contentReadyRef.current = true
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loading])

  useEffect(() => {
    if (!entryHash || !contentReadyRef.current || readOnly) return

    const hasSig = hasAnySignature(signSkipper, signCrew)
    if (!hasSig) {
      lockedContentHashRef.current = null
      return
    }

    if (!lockedContentHashRef.current) {
      lockedContentHashRef.current = entryHash
      return
    }

    if (entryHash !== lockedContentHashRef.current) {
      lockedContentHashRef.current = null
      const hadSkipper = !!signSkipper
      const hadCrew = !!signCrew
      const skipperOnly = skipCrewSignClearRef.current
      skipCrewSignClearRef.current = false
      if (hadSkipper) setSignSkipper('')
      if (hadCrew && !skipperOnly) setSignCrew('')
      if (lastSignatureAlertHashRef.current !== entryHash && (hadSkipper || (hadCrew && !skipperOnly))) {
        lastSignatureAlertHashRef.current = entryHash
        void showAlertRef.current(
          skipperOnly ? t('logs.sign_cleared_skipper_re_sign') : t('logs.sign_cleared_re_sign'),
          skipperOnly ? t('logs.sign_cleared_skipper_re_sign_title') : t('logs.sign_cleared_re_sign_title')
        )
      }
    }
  }, [entryHash, signSkipper, signCrew, readOnly, t])

  const confirmSignWarning = useCallback(async (): Promise<boolean> => {
    return showConfirm(
      t('logs.sign_lock_warning'),
      t('logs.sign_lock_warning_title'),
      t('logs.sign_proceed'),
      t('logs.sign_cancel')
    )
  }, [showConfirm, t])

  const skipperSignatureValid = !isPasskeySignature(signSkipper) || isSignatureValidForEntry(signSkipper, entryHash)
  const crewSignatureValid = !isPasskeySignature(signCrew) || isSignatureValidForEntry(signCrew, entryHash)

  const handlePasskeySignSkipper = async () => {
    if (!canSignSkipper) return
    const confirmed = await confirmSignWarning()
    if (!confirmed) return

    const hash = await hashEntryForSigning(buildPayloadForSigning())
    const signature = await signLogEntry({
      logbookId,
      entryId,
      entryHash: hash,
      role: 'skipper'
    })
    setSignSkipper(signature)
    entryHashSeqRef.current += 1
    setEntryHash(hash)
    lockedContentHashRef.current = hash
    trackPlausibleEvent(PlausibleEvents.ENTRY_SIGNED, { role: 'skipper' })
  }

  const handlePasskeySignCrew = async () => {
    if (!canSignCrew) return
    const confirmed = await confirmSignWarning()
    if (!confirmed) return

    const hash = await hashEntryForSigning(buildPayloadForSigning())
    const signature = await signLogEntry({
      logbookId,
      entryId,
      entryHash: hash,
      role: 'crew'
    })
    setSignCrew(signature)
    entryHashSeqRef.current += 1
    setEntryHash(hash)
    lockedContentHashRef.current = hash
    trackPlausibleEvent(PlausibleEvents.ENTRY_SIGNED, { role: 'crew' })
  }

  // Auto-calculate Freshwater Consumption
  useEffect(() => {
    const morning = parseFloat(fwMorning) || 0
    const refilled = parseFloat(fwRefilled) || 0
    const evening = parseFloat(fwEvening) || 0
    const cons = morning + refilled - evening
    setFwConsumption(cons >= 0 ? String(cons) : '0')
  }, [fwMorning, fwRefilled, fwEvening])

  // Auto-calculate Fuel Consumption
  useEffect(() => {
    const morning = parseFloat(fuelMorning) || 0
    const refilled = parseFloat(fuelRefilled) || 0
    const evening = parseFloat(fuelEvening) || 0
    const cons = morning + refilled - evening
    setFuelConsumption(cons >= 0 ? String(cons) : '0')
  }, [fuelMorning, fuelRefilled, fuelEvening])

  const fwRefilledNoCapacity =
    (tankCapacities.freshwaterCapacityL ?? 0) > 0 && fwRefilledMax == null
  const fuelRefilledNoCapacity =
    (tankCapacities.fuelCapacityL ?? 0) > 0 && fuelRefilledMax == null

  useEffect(() => {
    const refilled = parseFloat(fwRefilled) || 0
    if (fwRefilledMax == null) {
      if (fwRefilledNoCapacity && refilled > 0) {
        setFwRefilled(formatTankLitersForInput(0))
      }
      return
    }
    if (refilled > fwRefilledMax) {
      setFwRefilled(formatTankLitersForInput(fwRefilledMax))
    }
  }, [fwRefilledMax, fwRefilled, fwRefilledNoCapacity])

  useEffect(() => {
    if (fwEveningMax == null) return
    const evening = parseFloat(fwEvening) || 0
    if (evening > fwEveningMax) {
      setFwEvening(formatTankLitersForInput(fwEveningMax))
    }
  }, [fwEveningMax, fwEvening])

  useEffect(() => {
    const refilled = parseFloat(fuelRefilled) || 0
    if (fuelRefilledMax == null) {
      if (fuelRefilledNoCapacity && refilled > 0) {
        setFuelRefilled(formatTankLitersForInput(0))
      }
      return
    }
    if (refilled > fuelRefilledMax) {
      setFuelRefilled(formatTankLitersForInput(fuelRefilledMax))
    }
  }, [fuelRefilledMax, fuelRefilled, fuelRefilledNoCapacity])

  useEffect(() => {
    if (fuelEveningMax == null) return
    const evening = parseFloat(fuelEvening) || 0
    if (evening > fuelEveningMax) {
      setFuelEvening(formatTankLitersForInput(fuelEveningMax))
    }
  }, [fuelEveningMax, fuelEvening])

  // Load vessel sails and tank capacities
  useEffect(() => {
    async function loadYachtMeta() {
      try {
        const { resolveVesselForLogbook } = await import('../services/resolveVessel.js')
        const vessel =
          readOnly && preloadedYacht
            ? (preloadedYacht as Record<string, unknown>)
            : await resolveVesselForLogbook(logbookId, { preloadedYacht: preloadedYacht ?? undefined })
        if (!vessel) return
        if (vessel.sails && Array.isArray(vessel.sails)) {
          setYachtSails(vessel.sails)
        }
        setTankCapacities(extractTankCapacitiesFromYacht(vessel))
      } catch (err) {
        console.error('Failed to load vessel meta in editor:', err)
      }
    }
    void loadYachtMeta()
  }, [logbookId, preloadedYacht, readOnly])

  // Load entry details
  useEffect(() => {
    async function loadEntry() {
      setLoading(true)
      setError(null)
      setSavedFingerprint(null)
      lockedContentHashRef.current = null
      contentReadyRef.current = false
      lastSignatureAlertHashRef.current = null
      try {
        if (readOnly && preloadedEntry) {
          setDate(preloadedEntry.date || '')
          setDayOfTravel(preloadedEntry.dayOfTravel || '')
          setDeparture(preloadedEntry.departure || '')
          setDestination(preloadedEntry.destination || '')
          
          if (preloadedEntry.freshwater) {
            setFwMorning(String(preloadedEntry.freshwater.morning || 0))
            setFwRefilled(String(preloadedEntry.freshwater.refilled || 0))
            setFwEvening(String(preloadedEntry.freshwater.evening || 0))
            setFwConsumption(String(preloadedEntry.freshwater.consumption ?? 0))
          }
          if (preloadedEntry.fuel) {
            setFuelMorning(String(preloadedEntry.fuel.morning || 0))
            setFuelRefilled(String(preloadedEntry.fuel.refilled || 0))
            setFuelEvening(String(preloadedEntry.fuel.evening || 0))
            setFuelConsumption(String(preloadedEntry.fuel.consumption ?? 0))
          }
          if (preloadedEntry.greywater) {
            setGreywaterLevel(String(preloadedEntry.greywater.level || 0))
          } else {
            setGreywaterLevel('0')
          }

          setSignSkipper(normalizeSignature(preloadedEntry.signSkipper) || '')
          setSignCrew(normalizeSignature(preloadedEntry.signCrew) || '')
          setEntryCrew(entryCrewFromPreviousEntry(preloadedEntry as Record<string, unknown>))
          loadTrackStatsFromEntry(preloadedEntry)
          setEvents(sortLogEventsByTime((preloadedEntry.events || []).map(normalizeLogEvent)))
          setSavedFingerprint(fingerprintFromStoredEntry(preloadedEntry))
          return
        }

        const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
        if (!masterKey) throw new Error('Encryption key not found. Please log in.')

        const local = await db.entries.get(entryId)
        if (local) {
          const decrypted = await decryptJson(local.encryptedData, local.iv, local.tag, masterKey)
          if (decrypted) {
            setDate(decrypted.date || '')
            setDayOfTravel(decrypted.dayOfTravel || '')
            setDeparture(decrypted.departure || '')
            setDestination(decrypted.destination || '')
            
            if (decrypted.freshwater) {
              setFwMorning(String(decrypted.freshwater.morning || 0))
              setFwRefilled(String(decrypted.freshwater.refilled || 0))
              setFwEvening(String(decrypted.freshwater.evening || 0))
              setFwConsumption(String(decrypted.freshwater.consumption ?? 0))
            }
            if (decrypted.fuel) {
              setFuelMorning(String(decrypted.fuel.morning || 0))
              setFuelRefilled(String(decrypted.fuel.refilled || 0))
              setFuelEvening(String(decrypted.fuel.evening || 0))
              setFuelConsumption(String(decrypted.fuel.consumption ?? 0))
            }
            if (decrypted.greywater) {
              setGreywaterLevel(String(decrypted.greywater.level || 0))
            } else {
              setGreywaterLevel('0')
            }

            setSignSkipper(normalizeSignature(decrypted.signSkipper) || '')
            setSignCrew(normalizeSignature(decrypted.signCrew) || '')
            setEntryCrew(entryCrewFromPreviousEntry(decrypted as Record<string, unknown>))
            loadTrackStatsFromEntry(decrypted)
            setEvents(sortLogEventsByTime((decrypted.events || []).map(normalizeLogEvent)))
            setSavedFingerprint(fingerprintFromStoredEntry(decrypted))
          }
        }
      } catch (err: any) {
        console.error('Failed to load entry details:', err)
        setError(err.message || 'Decryption failed. Could not load entry details.')
      } finally {
        setLoading(false)
      }
    }

    loadEntry()
  }, [entryId, preloadedEntry])

  const loadTrack = async () => {
    if (readOnly && preloadedTrack) {
      setSavedTrack({
        waypoints: preloadedTrack.waypoints ?? [],
        gpxContent: preloadedTrack.gpxContent ?? '',
        filename: preloadedTrack.filename ?? 'track.gpx',
        fileType: preloadedTrack.fileType ?? 'gpx'
      })
      return
    }
    try {
      const track = await getDecryptedTrack(entryId)
      setSavedTrack(track)
    } catch (e) {
      console.warn('Failed to load track file:', e)
    }
  }

  useEffect(() => {
    loadTrack()
  }, [entryId, preloadedTrack])

  const loadNmeaArchive = async () => {
    if (readOnly) return
    try {
      const archive = await getNmeaArchive(entryId)
      setNmeaArchive(archive)
    } catch {
      setNmeaArchive(null)
    }
  }

  useEffect(() => {
    loadNmeaArchive()
  }, [entryId, readOnly])

  const handleNmeaImport = async (importedEvents: LogEventPayload[], waypoints?: TrackWaypoint[]) => {
    setEvents((prev) => sortLogEventsByTime([...prev, ...importedEvents]))
    if (waypoints && waypoints.length > 0) {
      try {
        const gpxLike = waypoints
          .map((wp) => `        <trkpt lat="${wp.lat}" lon="${wp.lng}"><time>${new Date(wp.timestamp).toISOString()}</time></trkpt>`)
          .join('\n')
        const content = `<?xml version="1.0"?><gpx><trk><trkseg>\n${gpxLike}\n</trkseg></trk></gpx>`
        await saveUploadedTrack(logbookId, entryId, content, waypoints, 'imported-from-nmea.nmea', 'nmea')
        applyTrackStats(waypoints)
        await loadTrack()
        trackPlausibleEvent(PlausibleEvents.GPS_TRACK_UPLOADED)
      } catch (err: unknown) {
        console.warn('Failed to save NMEA track:', err)
      }
    }
    await loadNmeaArchive()
  }

  const handleDeleteNmeaArchive = async () => {
    if (!window.confirm(t('logs.nmea_archive_delete_confirm'))) return
    await deleteNmeaArchive(entryId)
    setNmeaArchive(null)
  }

  useEffect(() => {
    if (!savedTrack || savedTrack.waypoints.length < 2) return
    if (trackDistanceNm || trackSpeedMaxKn || trackSpeedAvgKn) return
    applyTrackStats(savedTrack.waypoints)
  }, [savedTrack, trackDistanceNm, trackSpeedMaxKn, trackSpeedAvgKn])

  // Track file upload handlers
  const handleFileUpload = async (file: File) => {
    if (readOnly) return
    setUploadError(null)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        if (!text) {
          throw new Error('File is empty')
        }

        const { waypoints: parsedWps, type: fileType } = parseTrackFile(text, file.name)
        
        if (parsedWps.length === 0) {
          throw new Error('No coordinates found in file. Supported formats: GPX, KML, GeoJSON.')
        }

        await saveUploadedTrack(logbookId, entryId, text, parsedWps, file.name, fileType)
        applyTrackStats(parsedWps)
        await loadTrack()
        trackPlausibleEvent(PlausibleEvents.GPS_TRACK_UPLOADED)
      } catch (err: any) {
        console.error('File parsing failed:', err)
        setUploadError(err.message || 'Failed to parse track file.')
      }
    }
    reader.onerror = () => {
      setUploadError('Failed to read file.')
    }
    reader.readAsText(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  const handleDeleteTrack = async () => {
    if (readOnly) return
    if (!window.confirm(t('logs.gps_track_delete_confirm'))) {
      return
    }
    try {
      await deleteTrack(logbookId, entryId)
      setSavedTrack(null)
      setTrackDistanceNm('')
      setTrackSpeedMaxKn('')
      setTrackSpeedAvgKn('')
      setUploadError(null)
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete track')
    }
  }

  const handleGetGps = () => {
    if (readOnly) return
    const lookupFallback = async () => {
      const locationQuery = evLocationName.trim() || departure.trim() || destination.trim()
      if (!locationQuery) {
        showAlert('GPS capturing failed, and no location name is entered in "Ort / Hafen" or "Start-Hafen" to look up coordinates.')
        return
      }

      try {
        const data = await fetchOpenWeatherCurrent(
          { q: locationQuery },
          { analyticsSource: 'entry_editor_gps_lookup' }
        )
        const coord = data.coord as { lat?: number; lon?: number } | undefined
        if (coord?.lat !== undefined && coord?.lon !== undefined) {
          setEvGpsLat(Number(coord.lat).toFixed(6))
          setEvGpsLng(Number(coord.lon).toFixed(6))
          showAlert(`Coordinates loaded for "${locationQuery}" via OpenWeatherMap.`)
        }
      } catch (e) {
        if (e instanceof WeatherApiError && e.code === 'NO_KEY') {
          showAlert(t('settings.no_key'))
          return
        }
        showAlert('Failed to retrieve GPS location or look up coordinates by location name.')
      }
    }

    if (!navigator.geolocation) {
      lookupFallback()
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEvGpsLat(pos.coords.latitude.toFixed(6))
        setEvGpsLng(pos.coords.longitude.toFixed(6))
      },
      (err) => {
        console.warn('GPS capturing failed, trying fallback:', err)
        lookupFallback()
      }
    )
  }

  const handleFetchWeather = async () => {
    const localToday = new Date()
    const todayStr = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`

    if (date && date !== todayStr) {
      showAlert(t('settings.weather_date_mismatch', { date, today: todayStr }))
      return
    }

    const hasGps = evGpsLat && evGpsLng
    const fallbackLocation = evLocationName.trim() || departure.trim() || destination.trim()

    if (!hasGps && !fallbackLocation) {
      showAlert(t('settings.gps_error'))
      return
    }

    setWeatherLoading(true)
    try {
      const data = await fetchOpenWeatherCurrent(
        hasGps
          ? { lat: evGpsLat, lon: evGpsLng }
          : { q: fallbackLocation },
        { analyticsSource: 'entry_editor' }
      )

      const coord = data.coord as { lat?: number; lon?: number } | undefined
      // If fetched by location, automatically pre-fill GPS coordinates
      if (!hasGps && coord?.lat !== undefined && coord?.lon !== undefined) {
        setEvGpsLat(Number(coord.lat).toFixed(6))
        setEvGpsLng(Number(coord.lon).toFixed(6))
      }

      const parsed = parseOwmCurrentWeather(data)
      setEvWindStrength(parsed.windStrength)
      setEvWindPressure(parsed.windPressure)
      if (parsed.windDirection) setEvWindDirection(parsed.windDirection)
      if (parsed.visibility) setEvVisibility(parsed.visibility)
      if (parsed.weatherIcon) setEvWeatherIcon(parsed.weatherIcon)

      showAlert(t('settings.weather_success'))
    } catch (err) {
      if (err instanceof WeatherApiError && err.code === 'NO_KEY') {
        showAlert(t('settings.no_key'))
        return
      }
      console.error('Weather prefilling failed:', err)
      showAlert(t('settings.weather_error'))
    } finally {
      setWeatherLoading(false)
    }
  }

  const defaultSails = i18n.language === 'de'
    ? ['Großsegel', 'Genua', 'Fock', 'Spinnaker', 'Gennaker']
    : ['Mainsail', 'Genoa', 'Jib', 'Spinnaker', 'Gennaker']

  const eventSailOptions = yachtSails.length > 0 ? yachtSails : defaultSails
  const showSailsPickerToggle = eventSailOptions.length + 1 > 6

  const toggleSailOrMotor = (item: string) => {
    let currentItems = evSailsOrMotor
      .split(/\s*(?:\+|\bplus\b|,)\s*/i)
      .map(s => s.trim())
      .filter(Boolean)

    if (currentItems.some(s => s.toLowerCase() === item.toLowerCase())) {
      currentItems = currentItems.filter(s => s.toLowerCase() !== item.toLowerCase())
    } else {
      currentItems.push(item)
    }

    setEvSailsOrMotor(currentItems.join(' + '))
  }

  const isItemActive = (item: string) => {
    const currentItems = evSailsOrMotor
      .split(/\s*(?:\+|\bplus\b|,)\s*/i)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
    return currentItems.includes(item.toLowerCase())
  }

  const motorPropulsionLabel = t('logs.motor_propulsion')
  const sortedEventSailOptions = [...eventSailOptions].sort((a, b) => {
    const aActive = isItemActive(a)
    const bActive = isItemActive(b)
    if (aActive === bActive) return 0
    return aActive ? -1 : 1
  })
  const isMotorActive = isItemActive(motorPropulsionLabel)

  const clearEventForm = () => {
    setEvTime(currentLocalTimeHHMM())
    setEvMgk('')
    setEvRwk('')
    setEvWindPressure('')
    setEvWindDirection('')
    setEvWindStrength('')
    setEvSeaState('')
    setEvVisibility('')
    setEvWeatherIcon('')
    setEvCurrent('')
    setEvHeel('')
    setEvSailsOrMotor('')
    setEvLogReading('')
    setEvDistance('')
    setEvGpsLat('')
    setEvGpsLng('')
    setEvRemarks('')
    setEvLocationName('')
    setEditingEventIndex(null)
    setSailsPickerExpanded(false)
  }

  const fillEventForm = (ev: LogEvent) => {
    const normalized = normalizeLogEvent(ev)
    setEvTime(normalized.time)
    setEvMgk(normalized.mgk)
    setEvRwk(normalized.rwk)
    setEvWindPressure(normalized.windPressure)
    setEvWindDirection(normalized.windDirection)
    setEvWindStrength(normalized.windStrength)
    setEvSeaState(normalized.seaState)
    setEvVisibility(normalized.visibility)
    setEvWeatherIcon(normalized.weatherIcon)
    setEvCurrent(normalized.current)
    setEvHeel(normalized.heel)
    setEvSailsOrMotor(normalized.sailsOrMotor)
    setEvLogReading(normalized.logReading)
    setEvDistance(normalized.distance)
    setEvGpsLat(normalized.gpsLat)
    setEvGpsLng(normalized.gpsLng)
    setEvRemarks(normalized.remarks)
    setEvLocationName('')
  }

  const resolveSignaturesAfterContentChange = (skipperOnly = false) => {
    const hadSkipper = !!signSkipper
    const hadCrew = !!signCrew
    const cleared = hadSkipper || (hadCrew && !skipperOnly)
    skipCrewSignClearRef.current = skipperOnly
    const nextSkipper: SignatureValue | '' = hadSkipper ? '' : signSkipper
    const nextCrew: SignatureValue | '' = hadCrew && !skipperOnly ? '' : signCrew
    if (cleared) {
      if (hadSkipper) setSignSkipper('')
      if (hadCrew && !skipperOnly) setSignCrew('')
      lockedContentHashRef.current = null
    }
    return { signSkipper: nextSkipper, signCrew: nextCrew, cleared }
  }

  const markSkipperSignatureClearedForEventChange = () => {
    resolveSignaturesAfterContentChange(true)
  }

  const handleEditEvent = (index: number) => {
    if (readOnly) return
    const ev = events[index]
    if (!ev) return
    fillEventForm(ev)
    setEditingEventIndex(index)
  }

  const handleCancelEventEdit = () => {
    clearEventForm()
  }

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly || !isValidTimeHHMM(evTime)) return

    const eventData = buildEventFromForm()
    const isEdit = editingEventIndex !== null
    const hadSkipperSignature = isEdit && !!signSkipper

    if (hadSkipperSignature) {
      markSkipperSignatureClearedForEventChange()
    }

    const nextEvents = applyEventFormToEvents(eventData)

    try {
      await persistEntryToDb(nextEvents)
      setEvents(nextEvents)
      clearEventForm()
      if (hadSkipperSignature) {
        void showAlertRef.current(
          t('logs.sign_cleared_skipper_re_sign'),
          t('logs.sign_cleared_skipper_re_sign_title')
        )
      }
    } catch (err: any) {
      console.error('Failed to auto-save event:', err)
      setError(err.message || 'Failed to save event.')
    }
  }

  const handleDeleteEvent = async (index: number) => {
    if (readOnly) return
    const hadSkipperSignature = !!signSkipper
    markSkipperSignatureClearedForEventChange()
    const nextEvents = events.filter((_, idx) => idx !== index)
    setEvents(nextEvents)
    if (hadSkipperSignature) {
      void showAlertRef.current(
        t('logs.sign_cleared_skipper_re_sign'),
        t('logs.sign_cleared_skipper_re_sign_title')
      )
    }
    if (editingEventIndex === index) {
      clearEventForm()
    } else if (editingEventIndex !== null && index < editingEventIndex) {
      setEditingEventIndex(editingEventIndex - 1)
    }

    try {
      await persistEntryToDb(nextEvents)
    } catch (err: any) {
      console.error('Failed to auto-save after event delete:', err)
      setError(err.message || 'Failed to save event deletion.')
    }
  }

  const handleDownloadPdf = async () => {
    setExporting(true)
    setError(null)
    try {
      await downloadLogbookPagePdf(logbookId, entryId, date)
      trackPlausibleEvent(PlausibleEvents.PDF_EXPORTED, { scope: 'entry' })
    } catch (err: any) {
      console.error('Failed to download PDF:', err)
      setError(err.message || 'Failed to generate PDF export.')
    } finally {
      setExporting(false)
    }
  }

  const saveEntryChanges = useCallback(async () => {
    if (readOnly) return

    let eventsToSave = events
    let signaturesForSave: { signSkipper: SignatureValue | ''; signCrew: SignatureValue | '' } | undefined

    if (hasPendingEventForm) {
      const isEdit = editingEventIndex !== null
      const resolved = resolveSignaturesAfterContentChange(isEdit)
      signaturesForSave = {
        signSkipper: resolved.signSkipper,
        signCrew: resolved.signCrew
      }
      if (resolved.cleared) {
        void showAlertRef.current(
          isEdit ? t('logs.sign_cleared_skipper_re_sign') : t('logs.sign_cleared_re_sign'),
          isEdit ? t('logs.sign_cleared_skipper_re_sign_title') : t('logs.sign_cleared_re_sign_title')
        )
      }
      eventsToSave = applyEventFormToEvents(buildEventFromForm())
      setEvents(eventsToSave)
      clearEventForm()
    } else if (!isDirty) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await persistEntryToDb({
        eventsOverride: eventsToSave,
        ...signaturesForSave
      })

      await clearEntryDraft(logbookId, entryId)
      trackPlausibleEvent(PlausibleEvents.TRAVEL_DAY_SAVED)
    } finally {
      setSaving(false)
    }
  }, [
    readOnly, events, hasPendingEventForm, editingEventIndex, isDirty,
    resolveSignaturesAfterContentChange, applyEventFormToEvents, buildEventFromForm,
    clearEventForm, persistEntryToDb, logbookId, entryId, t
  ])

  useEffect(() => {
    saveBeforeLeaveRef.current = readOnly ? null : saveEntryChanges
  }, [readOnly, saveEntryChanges])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly) return

    setSuccess(false)
    try {
      await saveEntryChanges()
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        onBack()
      }, 1500)
    } catch (err: unknown) {
      console.error('Failed to save entry details:', err)
      setError(getErrorMessage(err, t('errors.save_failed')))
    }
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
    <div className="crew-dashboard-layout">
      {/* Top Header Controls */}
      <div className="form-card" style={{ paddingBottom: '20px' }}>
        <div className="section-title-bar">
          <div className="section-title-left">
            <button className="btn-back" onClick={() => void handleBack()} style={{ padding: '6px 12px' }}>
              <ChevronLeft size={16} />
              {t('logs.back_to_list')}
            </button>
            <div className="form-header" style={{ margin: 0 }}>
              <FileText size={24} className="form-icon" />
              <h2>
                {t('logs.route')}: {departure || '...'} → {destination || '...'} (Tag {dayOfTravel})
              </h2>
            </div>
          </div>
          
          <button 
            type="button" 
            className="btn secondary" 
            onClick={handleDownloadPdf} 
            disabled={saving || exporting} 
            style={{ width: 'auto', padding: '8px 16px' }}
          >
            <Download size={16} />
            <span className="hide-mobile">{exporting ? t('logs.exporting_pdf') : t('logs.export_pdf')}</span>
          </button>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {/* Main Journal Data Forms */}
      <form onSubmit={handleSubmit} className="vessel-form">
        {/* Section 1: Travel Day Headers */}
        <div className="form-card">
          <div className="form-header">
            <FileText size={20} className="form-icon" />
            <h3>{t('logs.travel_details')}</h3>
          </div>
          <div className="form-grid">
            <div className="input-group">
              <label>{t('logs.date')}</label>
              <input
                type="date"
                className="input-text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={saving || readOnly}
                required
              />
            </div>

            <div className="input-group">
              <label>{t('logs.day_of_travel')}</label>
              <input
                type="text"
                className="input-text"
                value={dayOfTravel}
                onChange={(e) => setDayOfTravel(e.target.value)}
                disabled={saving || readOnly}
                required
              />
            </div>

            <div className="input-group">
              <label>{t('logs.departure')}</label>
              <input
                type="text"
                className="input-text"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                disabled={saving || readOnly}
              />
            </div>

            <div className="input-group">
              <label>{t('logs.destination')}</label>
              <input
                type="text"
                className="input-text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={saving || readOnly}
              />
            </div>

            <div className="input-group">
              <label>{t('logs.motor_hours')}</label>
              <input
                type="number"
                className="input-text"
                value={motorHours}
                onChange={(e) => setMotorHours(e.target.value)}
                disabled={saving || readOnly}
                min="0"
                step="0.1"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Freshwater and Fuel Consumption */}
        <div className="form-grid">
          {/* Freshwater card */}
          <div className="form-card">
            <div className="form-header">
              <Compass size={20} className="form-icon" />
              <h3>{t('logs.freshwater')}</h3>
            </div>
            <div className="consumption-grid">
              <TankLiterInput
                id="fw-morning"
                label={t('logs.morning')}
                value={fwMorning}
                onChange={setFwMorning}
                maxLiters={tankCapacities.freshwaterCapacityL}
                disabled={saving || readOnly}
                titleTooltip={tankCapacityTooltip}
              />
              <TankLiterInput
                id="fw-refilled"
                label={t('logs.refilled')}
                value={fwRefilled}
                onChange={setFwRefilled}
                maxLiters={fwRefilledMax}
                disabled={saving || readOnly || fwRefilledNoCapacity}
                titleTooltip={tankCapacityTooltip}
              />
              <TankLiterInput
                id="fw-evening"
                label={t('logs.evening')}
                value={fwEvening}
                onChange={setFwEvening}
                maxLiters={fwEveningMax}
                disabled={saving || readOnly}
                titleTooltip={tankCapacityTooltip}
              />
              <div className="input-group">
                <label title={tankCapacityTooltip}>{t('logs.consumption')} (L)</label>
                <input
                  type="number"
                  className="input-text consumption-value"
                  value={fwConsumption}
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  title={tankCapacityTooltip}
                />
              </div>
            </div>
          </div>

          {/* Fuel card */}
          <div className="form-card">
            <div className="form-header">
              <Compass size={20} className="form-icon" />
              <h3>{t('logs.fuel')}</h3>
            </div>
            <div className="consumption-grid">
              <TankLiterInput
                id="fuel-morning"
                label={t('logs.morning')}
                value={fuelMorning}
                onChange={setFuelMorning}
                maxLiters={tankCapacities.fuelCapacityL}
                disabled={saving || readOnly}
                titleTooltip={tankCapacityTooltip}
              />
              <TankLiterInput
                id="fuel-refilled"
                label={t('logs.refilled')}
                value={fuelRefilled}
                onChange={setFuelRefilled}
                maxLiters={fuelRefilledMax}
                disabled={saving || readOnly || fuelRefilledNoCapacity}
                titleTooltip={tankCapacityTooltip}
              />
              <TankLiterInput
                id="fuel-evening"
                label={t('logs.evening')}
                value={fuelEvening}
                onChange={setFuelEvening}
                maxLiters={fuelEveningMax}
                disabled={saving || readOnly}
                titleTooltip={tankCapacityTooltip}
              />
              <div className="input-group">
                <label title={tankCapacityTooltip}>{t('logs.consumption')} (L)</label>
                <input
                  type="number"
                  className="input-text consumption-value"
                  value={fuelConsumption}
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  title={tankCapacityTooltip}
                />
              </div>

              <div className="input-group">
                <label title={tankCapacityTooltip}>{t('logs.fuel_per_motor_hour')}</label>
                <input
                  type="text"
                  className="input-text consumption-value"
                  value={
                    fuelPerMotorHour != null
                      ? `${formatFuelPerMotorHour(fuelPerMotorHour)} L/h`
                      : '—'
                  }
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  title={tankCapacityTooltip}
                />
              </div>
            </div>
          </div>

          {/* Greywater card */}
          <div className="form-card">
            <div className="form-header">
              <Compass size={20} className="form-icon" />
              <h3>{t('logs.greywater')}</h3>
            </div>
            <div className="consumption-grid">
              <TankLiterInput
                id="greywater-level"
                label={t('logs.greywater_level')}
                value={greywaterLevel}
                onChange={setGreywaterLevel}
                maxLiters={tankCapacities.greywaterCapacityL}
                disabled={saving || readOnly}
                titleTooltip={tankCapacityTooltip}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Event Journal Entries */}
        <div className="form-card">
          <div className="form-header mb-4">
            <Compass size={20} className="form-icon" />
            <h3>{t('logs.event_title')}</h3>
          </div>

          {/* List existing events */}
          {events.length === 0 ? (
            <div className="dashboard-status-msg mb-6">{t('logs.no_events')}</div>
          ) : (
            <div className="events-scroll-container mb-6">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>{t('logs.event_time')}</th>
                    <th>{t('logs.event_mgk')}</th>
                    <th>{t('logs.event_rwk')}</th>
                    <th>{t('logs.event_wind_direction')}</th>
                    <th>{t('logs.event_wind_strength')}</th>
                    <th>{t('logs.event_sea_state')}</th>
                    <th>{t('logs.event_weather')}</th>
                    <th>{t('logs.event_log')}</th>
                    <th>{t('logs.event_gps')}</th>
                    <th>{t('logs.event_remarks')}</th>
                    {!readOnly && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, idx) => (
                    <tr key={idx}>
                      <td className="font-mono">{ev.time}</td>
                      <td>{ev.mgk ? `${ev.mgk}°` : '—'}</td>
                      <td>{ev.rwk ? `${ev.rwk}°` : '—'}</td>
                      <td>{ev.windDirection || '—'}</td>
                      <td>{ev.windStrength || '—'}</td>
                      <td>{ev.seaState || '—'}</td>
                      <td>
                        {ev.weatherIcon ? (
                          <img
                            src={`https://openweathermap.org/img/wn/${ev.weatherIcon}.png`}
                            alt="Weather"
                            title="Weather Icon"
                            className="table-weather-img"
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{ev.logReading ? `${ev.logReading} nm` : '—'}</td>
                      <td className="font-mono text-sm">
                        {ev.gpsLat && ev.gpsLng ? `${ev.gpsLat}, ${ev.gpsLng}` : '—'}
                      </td>
                      <td className="remarks-td">{ev.remarks}</td>
                      {!readOnly && (
                        <td className="events-actions-td">
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => handleEditEvent(idx)}
                            title={t('logs.edit_event')}
                            disabled={editingEventIndex !== null && editingEventIndex !== idx}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon logout"
                            onClick={() => handleDeleteEvent(idx)}
                            title={t('logs.delete_event')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add New Event Form Sub-Card */}
          {!readOnly && (
            <div className="member-editor-card glass">
              <h4 style={{ margin: '0 0 16px 0', color: '#fbbf24' }}>
                {editingEventIndex !== null ? t('logs.edit_event') : t('logs.add_event')}
              </h4>
            
            <div className="form-grid mb-4">
              <div className="input-group">
                <label>
                  <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                  {t('logs.event_time')} *
                </label>
                <EventTimeInput24h
                  value={evTime}
                  onChange={setEvTime}
                  disabled={saving}
                  aria-label={t('logs.event_time')}
                />
              </div>

              <div className="input-group course-dial-section">
                <label>
                  <Compass size={12} style={{ display: 'inline', marginRight: 4 }} />
                  {t('logs.event_course_section')}
                </label>
                <div className="course-dial-tabs" role="tablist" aria-label={t('logs.event_course_section')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeCourseTab === 'mgk'}
                    className={`course-dial-tab${activeCourseTab === 'mgk' ? ' is-active' : ''}`}
                    onClick={() => setActiveCourseTab('mgk')}
                    disabled={saving}
                  >
                    {t('logs.course_tab_mgk')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeCourseTab === 'rwk'}
                    className={`course-dial-tab${activeCourseTab === 'rwk' ? ' is-active' : ''}`}
                    onClick={() => setActiveCourseTab('rwk')}
                    disabled={saving}
                  >
                    {t('logs.course_tab_rwk')}
                  </button>
                </div>
                <CourseDialInput
                  value={activeCourseTab === 'mgk' ? evMgk : evRwk}
                  onChange={activeCourseTab === 'mgk' ? setEvMgk : setEvRwk}
                  disabled={saving}
                  aria-label={activeCourseTab === 'mgk' ? t('logs.event_mgk') : t('logs.event_rwk')}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_log')}</label>
                <input
                  type="text"
                  placeholder="e.g. 124.5"
                  className="input-text"
                  value={evLogReading}
                  onChange={(e) => setEvLogReading(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-grid mb-4">
              <div className="input-group">
                <label>{t('logs.event_location')}</label>
                <input
                  type="text"
                  placeholder={t('logs.event_location_placeholder')}
                  className="input-text"
                  value={evLocationName}
                  onChange={(e) => setEvLocationName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_gps')} (Lat, Lng)</label>
                <div className="gps-input-row">
                  <input
                    type="text"
                    placeholder="Lat"
                    className="input-text"
                    value={evGpsLat}
                    onChange={(e) => setEvGpsLat(e.target.value)}
                    disabled={saving}
                  />
                  <input
                    type="text"
                    placeholder="Lng"
                    className="input-text"
                    value={evGpsLng}
                    onChange={(e) => setEvGpsLng(e.target.value)}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleGetGps}
                    title={t('logs.gps_btn')}
                    style={{ width: 'auto', padding: '12px' }}
                    disabled={saving}
                  >
                    <MapPin size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleFetchWeather}
                    title={t('logs.weather_btn')}
                    style={{ width: 'auto', padding: '12px' }}
                    disabled={
                      saving ||
                      weatherLoading ||
                      (!evGpsLat && !evLocationName.trim() && !departure.trim() && !destination.trim()) ||
                      (!!evGpsLat && !evGpsLng)
                    }
                  >
                    <CloudSun size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="form-grid weather-metrics-grid mb-4">
              <div className="input-group course-dial-section weather-metrics-span-2">
                <label>{t('logs.event_wind_direction')}</label>
                <CourseDialInput
                  value={evWindDirection}
                  onChange={setEvWindDirection}
                  disabled={saving || weatherLoading}
                  allowCardinal
                  displayMode="auto"
                  aria-label={t('logs.event_wind_direction')}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_wind_strength')}</label>
                <input
                  type="text"
                  placeholder="e.g. 4 Bft"
                  className="input-text"
                  value={evWindStrength}
                  onChange={(e) => setEvWindStrength(e.target.value)}
                  disabled={saving || weatherLoading}
                />
              </div>

              <MetricRangeInput
                label={t('logs.event_wind_pressure')}
                value={evWindPressure}
                onChange={setEvWindPressure}
                disabled={saving || weatherLoading}
                min={PRESSURE_MIN_HPA}
                max={PRESSURE_MAX_HPA}
                step={1}
                defaultNumeric={PRESSURE_DEFAULT_HPA}
                parse={parsePressureHpa}
                format={formatPressureHpa}
                formatDisplay={(hpa) =>
                  t('logs.weather_slider_pressure', { value: hpa, defaultValue: `${hpa} hPa` })}
                numberMin={PRESSURE_MIN_HPA}
                numberMax={PRESSURE_MAX_HPA}
                numberStep={1}
                numberPlaceholder="1013"
              />

              <MetricRangeInput
                label={t('logs.event_sea_state')}
                value={evSeaState}
                onChange={setEvSeaState}
                disabled={saving}
                min={SEA_STATE_MIN}
                max={SEA_STATE_MAX}
                step={1}
                defaultNumeric={0}
                parse={parseSeaState}
                format={formatSeaState}
                formatDisplay={(level) =>
                  t('logs.weather_slider_sea_state', { value: level, defaultValue: `${level}` })}
                numberMin={SEA_STATE_MIN}
                numberMax={SEA_STATE_MAX}
                numberStep={1}
                numberPlaceholder="3"
                allowLegacyText
              />

              <MetricRangeInput
                label={t('logs.event_visibility')}
                value={evVisibility}
                onChange={setEvVisibility}
                disabled={saving || weatherLoading}
                discreteValues={VISIBILITY_STEPS_M}
                defaultNumeric={10000}
                parse={parseVisibilityMeters}
                format={formatVisibilityMeters}
                formatDisplay={(m) => formatVisibilityMeters(m)}
                hideNumberInput
              />

              <MetricRangeInput
                label={t('logs.event_heel')}
                value={evHeel}
                onChange={setEvHeel}
                disabled={saving}
                min={HEEL_MIN_DEG}
                max={HEEL_MAX_DEG}
                step={1}
                defaultNumeric={0}
                parse={parseHeelDeg}
                format={formatHeelDeg}
                formatDisplay={(deg) =>
                  t('logs.weather_slider_heel', { value: deg, defaultValue: `${deg}°` })}
                numberMin={HEEL_MIN_DEG}
                numberMax={HEEL_MAX_DEG}
                numberStep={1}
                numberPlaceholder="5"
              />
            </div>

            <div className="form-grid mb-4">
              <div className="input-group">
                <label>{t('logs.event_sails')}</label>
                <input
                  type="text"
                  placeholder="e.g. Mainsail + Jib"
                  className="input-text"
                  value={evSailsOrMotor}
                  onChange={(e) => setEvSailsOrMotor(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_distance')}</label>
                <input
                  type="text"
                  placeholder="e.g. 12 nm"
                  className="input-text"
                  value={evDistance}
                  onChange={(e) => setEvDistance(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div
                className={[
                  'sails-picker-container grid-span-2',
                  showSailsPickerToggle ? 'is-collapsible' : '',
                  showSailsPickerToggle && !sailsPickerExpanded ? 'is-collapsed' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="sails-picker-pills">
                  {isMotorActive && (
                    <span
                      className={`sail-pill motor-pill active`}
                      onClick={() => toggleSailOrMotor(motorPropulsionLabel)}
                    >
                      {motorPropulsionLabel}
                    </span>
                  )}
                  {sortedEventSailOptions.map((sail) => (
                    <span
                      key={sail}
                      className={`sail-pill ${isItemActive(sail) ? 'active' : ''}`}
                      onClick={() => toggleSailOrMotor(sail)}
                    >
                      {sail}
                    </span>
                  ))}
                  {!isMotorActive && (
                    <span
                      className="sail-pill motor-pill"
                      onClick={() => toggleSailOrMotor(motorPropulsionLabel)}
                    >
                      {motorPropulsionLabel}
                    </span>
                  )}
                </div>
                {showSailsPickerToggle && (
                  <button
                    type="button"
                    className="sails-picker-toggle"
                    onClick={() => setSailsPickerExpanded((prev) => !prev)}
                    aria-expanded={sailsPickerExpanded}
                  >
                    {sailsPickerExpanded ? (
                      <>
                        <ChevronUp size={14} aria-hidden="true" />
                        {t('logs.sails_picker_show_less')}
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} aria-hidden="true" />
                        {t('logs.sails_picker_show_more')}
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="input-group grid-span-2">
                <label>{t('logs.event_remarks')}</label>
                <input
                  type="text"
                  placeholder="Remarks"
                  className="input-text"
                  value={evRemarks}
                  onChange={(e) => setEvRemarks(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {editingEventIndex !== null && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleCancelEventEdit}
                  disabled={saving}
                  style={{ width: 'auto', padding: '10px 20px', display: 'flex' }}
                >
                  <X size={16} />
                  {t('logs.cancel_event_edit')}
                </button>
              )}
              <button
                type="button"
                className="btn secondary"
                onClick={handleSaveEvent}
                disabled={saving || !isValidTimeHHMM(evTime)}
                style={{ width: 'auto', padding: '10px 20px', display: 'flex' }}
              >
                {editingEventIndex !== null ? <Save size={16} /> : <Plus size={16} />}
                {editingEventIndex !== null ? t('logs.save_event_btn') : t('logs.add_event_btn')}
              </button>
            </div>
          </div>
          )}
        </div>

        {/* Track file upload */}
        <div className="form-card" data-tour="entry-track">
          <div className="form-header">
            <Upload size={20} className="form-icon" />
            <h3>{t('logs.track_upload_title')}</h3>
          </div>

          {uploadError && <div className="track-error-msg">{uploadError}</div>}

          {!savedTrack ? (
            <div
              className={`track-upload-zone ${dragOver ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".gpx,.kml,.json,.geojson"
                onChange={handleFileChange}
                disabled={saving}
              />
              <Upload size={36} className="track-upload-icon" />
              <div className="track-upload-text">{t('logs.gps_track_upload_btn')}</div>
              <div className="track-upload-subtext">{t('logs.gps_track_upload_help')}</div>
            </div>
          ) : (
            <>
              <div className="track-info-header">
                <div className="track-info-left">
                  <Upload size={16} style={{ color: '#fbbf24' }} />
                  <span className="track-info-name">{savedTrack.filename || 'track'}</span>
                  <span className="track-info-stats">
                    {(savedTrack.fileType ?? 'gpx').toUpperCase()}
                    {savedTrack.waypoints.length > 0 && (
                      <> · {savedTrack.waypoints.length} {t('logs.track_upload_points')}</>
                    )}
                    {trackDistanceNm && (
                      <> · {trackDistanceNm} sm</>
                    )}
                    {trackSpeedMaxKn && (
                      <> · max {trackSpeedMaxKn} kn</>
                    )}
                    {trackSpeedAvgKn && (
                      <> · Ø {trackSpeedAvgKn} kn</>
                    )}
                  </span>
                </div>
                <div className="track-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => downloadTrackFile(savedTrack)}
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title={t('logs.gps_tracking_btn_gpx')}
                  >
                    <Download size={14} />
                    <span className="hide-mobile">{t('logs.gps_tracking_btn_gpx')}</span>
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={handleDeleteTrack}
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                      title={t('logs.gps_track_delete')}
                    >
                      <Trash2 size={14} />
                      <span className="hide-mobile">{t('logs.gps_track_delete')}</span>
                    </button>
                  )}
                </div>
              </div>

              {savedTrack.waypoints.length > 0 && (
                <TrackMap waypoints={savedTrack.waypoints} />
              )}
            </>
          )}

          {!readOnly && (
            <div className="nmea-import-section" style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setNmeaWizardOpen(true)}
                style={{ width: 'auto', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FileText size={16} />
                {t('logs.nmea_import_btn')}
              </button>
              {nmeaArchive && (
                <div className="nmea-archive-info" style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{t('logs.nmea_archive_stored', { name: nmeaArchive.filename })}</span>
                  <button type="button" className="btn secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '13px' }} onClick={() => downloadNmeaArchive(nmeaArchive)}>
                    <Download size={14} />
                  </button>
                  <button type="button" className="btn secondary" style={{ width: 'auto', padding: '4px 10px', fontSize: '13px' }} onClick={handleDeleteNmeaArchive}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {(savedTrack || trackDistanceNm || trackSpeedMaxKn || trackSpeedAvgKn) && (
            <div className="form-grid track-stats-grid">
              <div className="input-group">
                <label>{t('logs.track_distance')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 5.0"
                  className="input-text"
                  value={trackDistanceNm}
                  onChange={(e) => setTrackDistanceNm(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>
              <div className="input-group">
                <label>{t('logs.track_speed_max')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 7.8"
                  className="input-text"
                  value={trackSpeedMaxKn}
                  onChange={(e) => setTrackSpeedMaxKn(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>
              <div className="input-group">
                <label>{t('logs.track_speed_avg')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 4.6"
                  className="input-text"
                  value={trackSpeedAvgKn}
                  onChange={(e) => setTrackSpeedAvgKn(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>
            </div>
          )}
        </div>

        <PhotoCapture entryId={entryId} logbookId={logbookId} readOnly={readOnly} preloadedPhotos={preloadedPhotos} />

        <EntryCrewSection
          logbookId={logbookId}
          readOnly={readOnly}
          value={entryCrew}
          onChange={setEntryCrew}
        />

        <SignatureSection
          readOnly={readOnly}
          disabled={saving}
          isOnline={isOnline}
          canSignSkipper={canSignSkipper}
          canSignCrew={canSignCrew}
          signSkipper={signSkipper}
          signCrew={signCrew}
          skipperSignatureValid={skipperSignatureValid}
          crewSignatureValid={crewSignatureValid}
          onSignSkipperChange={(value) => {
            if (canSignSkipper && !readOnly) setSignSkipper(value)
          }}
          onSignCrewChange={(value) => {
            if (!canSignCrew || readOnly) return
            if (!value) {
              setSignCrew('')
              return
            }
            if (isPasskeySignature(value) || isClassicSignature(value)) {
              setSignCrew(value)
              return
            }
            if (!canSignSkipper) {
              const userId = localStorage.getItem('active_userid') || ''
              const username = localStorage.getItem('active_username') || ''
              if (userId && username) {
                setSignCrew(createClassicSignature({
                  role: 'crew',
                  userId,
                  username,
                  signedAt: new Date().toISOString(),
                  payload: value
                }))
                return
              }
            }
            setSignCrew(value)
          }}
          onPasskeySignSkipper={handlePasskeySignSkipper}
          onPasskeySignCrew={handlePasskeySignCrew}
          onBeforeSign={confirmSignWarning}
        />

        {/* Save Controls */}
        {!readOnly && (
          <div className="form-actions mt-4">
            {success && (
              <div className="success-toast">
                <Check size={16} />
                <span>{t('logs.saved')}</span>
              </div>
            )}
            
            <button type="submit" className="btn primary" disabled={saving || !date || !dayOfTravel.trim() || !isDirty}>
              <Save size={18} />
              {saving ? t('logs.saving') : t('logs.save')}
            </button>
          </div>
        )}
      </form>

      <NmeaImportWizard
        open={nmeaWizardOpen}
        onClose={() => {
          setNmeaWizardOpen(false)
          void loadNmeaArchive()
        }}
        logbookId={logbookId}
        entryId={entryId}
        entryDate={date}
        nmeaArchive={nmeaArchive}
        onImport={handleNmeaImport}
      />
    </div>
  )
}
