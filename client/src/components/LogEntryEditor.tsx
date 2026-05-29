import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { downloadLogbookPagePdf } from '../services/pdfExport.js'
import { FileText, Save, ChevronLeft, Check, Compass, Plus, Trash2, MapPin, CloudSun, Clock, Download, Upload } from 'lucide-react'
import PhotoCapture from './PhotoCapture.tsx'
import SignatureSection from './SignatureSection.tsx'
import TrackMap from './TrackMap.tsx'
import { useDialog } from './ModalDialog.tsx'
import {
  normalizeSignature,
  serializeSignature,
  isPasskeySignature,
  isSignatureValidForEntry
} from '../utils/signatures.js'
import type { SignatureValue } from '../types/signatures.js'
import { buildLogEntryPayload } from '../utils/logEntryPayload.js'
import { hashEntryForSigning } from '../utils/entryCanonicalHash.js'
import { signLogEntry } from '../services/entrySigning.js'
import { getLogbookAccess } from '../services/logbookAccess.js'
import {
  getDecryptedTrack,
  saveUploadedTrack,
  deleteTrack,
  downloadTrackFile,
  parseTrackFile,
  type SavedTrack
} from '../services/trackUpload.js'
import { computeTrackStats, formatTrackStats } from '../utils/trackStats.js'

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

interface LogEvent {
  time: string
  mgk: string
  rwk: string
  windPressure: string
  windDirection: string
  windStrength: string
  seaState: string
  weatherIcon: string
  current: string
  heel: string
  sailsOrMotor: string
  logReading: string
  distance: string
  gpsLat: string
  gpsLng: string
  remarks: string
}

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
  const { showAlert } = useDialog()

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

  // Signatures
  const [signSkipper, setSignSkipper] = useState<SignatureValue | ''>('')
  const [signCrew, setSignCrew] = useState<SignatureValue | ''>('')
  const [isOwner, setIsOwner] = useState(false)
  const [hasWriteCollaborators, setHasWriteCollaborators] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [entryHash, setEntryHash] = useState('')

  // GPS track stats (from uploaded track)
  const [trackDistanceNm, setTrackDistanceNm] = useState('')
  const [trackSpeedMaxKn, setTrackSpeedMaxKn] = useState('')
  const [trackSpeedAvgKn, setTrackSpeedAvgKn] = useState('')

  // Events list state
  const [events, setEvents] = useState<LogEvent[]>([])

  // Add Event Form State
  const [evTime, setEvTime] = useState('')
  const [evMgk, setEvMgk] = useState('')
  const [evRwk, setEvRwk] = useState('')
  const [evWindPressure, setEvWindPressure] = useState('')
  const [evWindDirection, setEvWindDirection] = useState('')
  const [evWindStrength, setEvWindStrength] = useState('')
  const [evSeaState, setEvSeaState] = useState('')
  const [evWeatherIcon, setEvWeatherIcon] = useState('')
  const [evCurrent, setEvCurrent] = useState('')
  const [evHeel, setEvHeel] = useState('')
  const [evSailsOrMotor, setEvSailsOrMotor] = useState('')
  const [evLogReading, setEvLogReading] = useState('')
  const [evDistance, setEvDistance] = useState('')
  const [evGpsLat, setEvGpsLat] = useState('')
  const [evGpsLng, setEvGpsLng] = useState('')
  const [evRemarks, setEvRemarks] = useState('')
  const [evLocationName, setEvLocationName] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Track file upload
  const [savedTrack, setSavedTrack] = useState<SavedTrack | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
  }

  const buildPayloadForSigning = useCallback(() => {
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
      trackDistanceNm: trackDistanceNm.trim() ? parseFloat(trackDistanceNm) : undefined,
      trackSpeedMaxKn: trackSpeedMaxKn.trim() ? parseFloat(trackSpeedMaxKn) : undefined,
      trackSpeedAvgKn: trackSpeedAvgKn.trim() ? parseFloat(trackSpeedAvgKn) : undefined,
      events
    })
  }, [
    date, dayOfTravel, departure, destination,
    fwMorning, fwRefilled, fwEvening, fwConsumption,
    fuelMorning, fuelRefilled, fuelEvening, fuelConsumption,
    trackDistanceNm, trackSpeedMaxKn, trackSpeedAvgKn,
    events
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
      setIsOwner(access.isOwner)
      setHasWriteCollaborators(access.writeCollaboratorCount > 0)
    })
  }, [logbookId])

  useEffect(() => {
    let cancelled = false
    hashEntryForSigning(buildPayloadForSigning()).then((hash) => {
      if (!cancelled) setEntryHash(hash)
    })
    return () => { cancelled = true }
  }, [buildPayloadForSigning])

  const skipperSignatureValid = !isPasskeySignature(signSkipper) || isSignatureValidForEntry(signSkipper, entryHash)
  const crewSignatureValid = !isPasskeySignature(signCrew) || isSignatureValidForEntry(signCrew, entryHash)

  const handlePasskeySignSkipper = async () => {
    const hash = await hashEntryForSigning(buildPayloadForSigning())
    const signature = await signLogEntry({
      logbookId,
      entryId,
      entryHash: hash,
      role: 'skipper'
    })
    setSignSkipper(signature)
    setEntryHash(hash)
  }

  const handlePasskeySignCrew = async () => {
    const hash = await hashEntryForSigning(buildPayloadForSigning())
    const signature = await signLogEntry({
      logbookId,
      entryId,
      entryHash: hash,
      role: 'crew'
    })
    setSignCrew(signature)
    setEntryHash(hash)
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

  // Load Yacht Sails
  useEffect(() => {
    async function loadYachtSails() {
      if (readOnly && preloadedYacht?.sails) {
        setYachtSails(preloadedYacht.sails)
        return
      }
      try {
        const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
        if (!masterKey) return

        const yacht = await db.yachts.get(logbookId)
        if (yacht) {
          const decrypted = await decryptJson(yacht.encryptedData, yacht.iv, yacht.tag, masterKey)
          if (decrypted && decrypted.sails && Array.isArray(decrypted.sails)) {
            setYachtSails(decrypted.sails)
          }
        }
      } catch (err) {
        console.error('Failed to load yacht sails in editor:', err)
      }
    }
    loadYachtSails()
  }, [logbookId, preloadedYacht])

  // Load entry details
  useEffect(() => {
    async function loadEntry() {
      setLoading(true)
      setError(null)
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
          }
          if (preloadedEntry.fuel) {
            setFuelMorning(String(preloadedEntry.fuel.morning || 0))
            setFuelRefilled(String(preloadedEntry.fuel.refilled || 0))
            setFuelEvening(String(preloadedEntry.fuel.evening || 0))
          }

          setSignSkipper(normalizeSignature(preloadedEntry.signSkipper) || '')
          setSignCrew(normalizeSignature(preloadedEntry.signCrew) || '')
          loadTrackStatsFromEntry(preloadedEntry)
          setEvents(preloadedEntry.events || [])
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
            }
            if (decrypted.fuel) {
              setFuelMorning(String(decrypted.fuel.morning || 0))
              setFuelRefilled(String(decrypted.fuel.refilled || 0))
              setFuelEvening(String(decrypted.fuel.evening || 0))
            }

            setSignSkipper(normalizeSignature(decrypted.signSkipper) || '')
            setSignCrew(normalizeSignature(decrypted.signCrew) || '')
            loadTrackStatsFromEntry(decrypted)
            setEvents(decrypted.events || [])
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
      setSavedTrack(preloadedTrack)
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

      const apiKey = localStorage.getItem('owm_api_key')
      if (!apiKey) {
        showAlert('GPS capturing failed, and no OpenWeatherMap API key is configured to perform location lookup.')
        return
      }

      try {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(locationQuery)}&appid=${apiKey}&units=metric`
        )
        if (!res.ok) throw new Error('Location not found')
        const data = await res.json()
        if (data.coord) {
          setEvGpsLat(Number(data.coord.lat).toFixed(6))
          setEvGpsLng(Number(data.coord.lon).toFixed(6))
          showAlert(`Coordinates loaded for "${locationQuery}" via OpenWeatherMap.`)
        }
      } catch (e) {
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

    const apiKey = localStorage.getItem('owm_api_key')
    if (!apiKey) {
      showAlert(t('settings.no_key'))
      return
    }

    setWeatherLoading(true)
    try {
      let url = ''
      if (hasGps) {
        url = `https://api.openweathermap.org/data/2.5/weather?lat=${evGpsLat}&lon=${evGpsLng}&appid=${apiKey}&units=metric`
      } else {
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(fallbackLocation)}&appid=${apiKey}&units=metric`
      }

      const res = await fetch(url)

      if (!res.ok) throw new Error('Weather API rejected the request')

      const data = await res.json()

      // If fetched by location, automatically pre-fill GPS coordinates
      if (!hasGps && data.coord) {
        setEvGpsLat(Number(data.coord.lat).toFixed(6))
        setEvGpsLng(Number(data.coord.lon).toFixed(6))
      }

      // Convert wind speed m/s to Beaufort scale
      const mps = data.wind.speed || 0
      let bft = 0
      if (mps < 0.3) bft = 0
      else if (mps < 1.6) bft = 1
      else if (mps < 3.4) bft = 2
      else if (mps < 5.5) bft = 3
      else if (mps < 8.0) bft = 4
      else if (mps < 10.8) bft = 5
      else if (mps < 13.9) bft = 6
      else if (mps < 17.2) bft = 7
      else if (mps < 20.8) bft = 8
      else if (mps < 24.5) bft = 9
      else if (mps < 28.5) bft = 10
      else if (mps < 32.7) bft = 11
      else bft = 12

      setEvWindStrength(`${bft} Bft (${mps.toFixed(1)} m/s)`)
      setEvWindPressure(String(data.main.pressure || ''))
      
      // Calculate wind compass direction sector
      if (data.wind.deg !== undefined) {
        const deg = data.wind.deg
        const sectors = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
        const index = Math.round(deg / 22.5) % 16
        setEvWindDirection(sectors[index])
      }

      if (data.weather && data.weather[0]) {
        setEvWeatherIcon(data.weather[0].icon)
      }

      showAlert(t('settings.weather_success'))
    } catch (err) {
      console.error('Weather prefilling failed:', err)
      showAlert(t('settings.weather_error'))
    } finally {
      setWeatherLoading(false)
    }
  }

  const defaultSails = i18n.language === 'de'
    ? ['Großsegel', 'Genua', 'Fock', 'Spinnaker', 'Gennaker']
    : ['Mainsail', 'Genoa', 'Jib', 'Spinnaker', 'Gennaker']

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

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly || !evTime) return

    const newEvent: LogEvent = {
      time: evTime,
      mgk: evMgk.trim(),
      rwk: evRwk.trim(),
      windPressure: evWindPressure.trim(),
      windDirection: evWindDirection.trim(),
      windStrength: evWindStrength.trim(),
      seaState: evSeaState.trim(),
      weatherIcon: evWeatherIcon.trim(),
      current: evCurrent.trim(),
      heel: evHeel.trim(),
      sailsOrMotor: evSailsOrMotor.trim(),
      logReading: evLogReading.trim(),
      distance: evDistance.trim(),
      gpsLat: evGpsLat.trim(),
      gpsLng: evGpsLng.trim(),
      remarks: evRemarks.trim()
    }

    setEvents((prev) => [...prev, newEvent])

    // Clear event form fields
    setEvTime('')
    setEvMgk('')
    setEvRwk('')
    setEvWindPressure('')
    setEvWindDirection('')
    setEvWindStrength('')
    setEvSeaState('')
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
  }

  const handleDeleteEvent = (index: number) => {
    if (readOnly) return
    setEvents((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleDownloadPdf = async () => {
    setExporting(true)
    setError(null)
    try {
      await downloadLogbookPagePdf(logbookId, entryId, date)
    } catch (err: any) {
      console.error('Failed to download PDF:', err)
      setError(err.message || 'Failed to generate PDF export.')
    } finally {
      setExporting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
      if (!masterKey) throw new Error('Encryption key not found. Please log in.')

      const entryPayload = buildPayloadForSigning()
      const entryData = {
        ...entryPayload,
        signSkipper: serializeSignature(signSkipper),
        signCrew: serializeSignature(signCrew)
      }

      // E2E encrypt
      const encrypted = await encryptJson(entryData, masterKey)
      const now = new Date().toISOString()

      // Save locally
      await db.entries.put({
        payloadId: entryId,
        logbookId,
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: now
      })

      // Queue for background sync
      await db.syncQueue.put({
        action: 'update',
        type: 'entry',
        payloadId: entryId,
        logbookId,
        data: JSON.stringify(encrypted),
        updatedAt: now
      })

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        onBack()
      }, 1500)

      syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
    } catch (err: any) {
      console.error('Failed to save entry details:', err)
      setError(err.message || 'Failed to save entry details.')
    } finally {
      setSaving(false)
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
            <button className="btn-back" onClick={onBack} style={{ padding: '6px 12px' }}>
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
            <span>{exporting ? t('logs.exporting_pdf') : t('logs.export_pdf')}</span>
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
              <div className="input-group">
                <label>{t('logs.morning')}</label>
                <input
                  type="number"
                  className="input-text"
                  value={fwMorning}
                  onChange={(e) => setFwMorning(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.refilled')}</label>
                <input
                  type="number"
                  className="input-text"
                  value={fwRefilled}
                  onChange={(e) => setFwRefilled(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.evening')}</label>
                <input
                  type="number"
                  className="input-text"
                  value={fwEvening}
                  onChange={(e) => setFwEvening(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.consumption')} (L)</label>
                <input
                  type="number"
                  className="input-text consumption-value"
                  value={fwConsumption}
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
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
              <div className="input-group">
                <label>{t('logs.morning')}</label>
                <input
                  type="number"
                  className="input-text"
                  value={fuelMorning}
                  onChange={(e) => setFuelMorning(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.refilled')}</label>
                <input
                  type="number"
                  className="input-text"
                  value={fuelRefilled}
                  onChange={(e) => setFuelRefilled(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.evening')}</label>
                <input
                  type="number"
                  className="input-text"
                  value={fuelEvening}
                  onChange={(e) => setFuelEvening(e.target.value)}
                  disabled={saving || readOnly}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.consumption')} (L)</label>
                <input
                  type="number"
                  className="input-text consumption-value"
                  value={fuelConsumption}
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                />
              </div>
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
                        <td>
                          <button type="button" className="btn-icon logout" onClick={() => handleDeleteEvent(idx)}>
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
              <h4 style={{ margin: '0 0 16px 0', color: '#fbbf24' }}>{t('logs.add_event')}</h4>
            
            <div className="form-grid mb-4">
              <div className="input-group">
                <label>
                  <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                  {t('logs.event_time')} *
                </label>
                <input
                  type="time"
                  className="input-text"
                  value={evTime}
                  onChange={(e) => setEvTime(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_mgk')}</label>
                <input
                  type="text"
                  placeholder="e.g. 180"
                  className="input-text"
                  value={evMgk}
                  onChange={(e) => setEvMgk(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_rwk')}</label>
                <input
                  type="text"
                  placeholder="e.g. 185"
                  className="input-text"
                  value={evRwk}
                  onChange={(e) => setEvRwk(e.target.value)}
                  disabled={saving}
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

            <div className="form-grid mb-4">
              <div className="input-group">
                <label>{t('logs.event_wind_direction')}</label>
                <input
                  type="text"
                  placeholder="e.g. NNE"
                  className="input-text"
                  value={evWindDirection}
                  onChange={(e) => setEvWindDirection(e.target.value)}
                  disabled={saving || weatherLoading}
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

              <div className="input-group">
                <label>{t('logs.event_wind_pressure')}</label>
                <input
                  type="text"
                  placeholder="e.g. 1013 hPa"
                  className="input-text"
                  value={evWindPressure}
                  onChange={(e) => setEvWindPressure(e.target.value)}
                  disabled={saving || weatherLoading}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_sea_state')}</label>
                <input
                  type="text"
                  placeholder="e.g. 3"
                  className="input-text"
                  value={evSeaState}
                  onChange={(e) => setEvSeaState(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.event_heel')}</label>
                <input
                  type="text"
                  placeholder="e.g. 5"
                  className="input-text"
                  value={evHeel}
                  onChange={(e) => setEvHeel(e.target.value)}
                  disabled={saving}
                />
              </div>
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
                <div className="sails-picker-container">
                  <div className="sails-picker-pills">
                    {(yachtSails.length > 0 ? yachtSails : defaultSails).map((sail) => (
                      <span
                        key={sail}
                        className={`sail-pill ${isItemActive(sail) ? 'active' : ''}`}
                        onClick={() => toggleSailOrMotor(sail)}
                      >
                        {sail}
                      </span>
                    ))}
                    <span
                      className={`sail-pill motor-pill ${isItemActive(t('logs.motor_propulsion')) ? 'active' : ''}`}
                      onClick={() => toggleSailOrMotor(t('logs.motor_propulsion'))}
                    >
                      {t('logs.motor_propulsion')}
                    </span>
                  </div>
                </div>
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

              <div className="input-group" style={{ gridColumn: 'span 2' }}>
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

            <button
              type="button"
              className="btn secondary"
              onClick={handleAddEvent}
              disabled={saving || !evTime}
              style={{ width: 'auto', padding: '10px 20px', marginLeft: 'auto', display: 'flex' }}
            >
              <Plus size={16} />
              Add Event Entry
            </button>
          </div>
          )}
        </div>

        {/* Track file upload */}
        <div className="form-card">
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
                    {savedTrack.fileType.toUpperCase()}
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => downloadTrackFile(savedTrack)}
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Download size={14} />
                    {t('logs.gps_tracking_btn_gpx')}
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={handleDeleteTrack}
                      style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    >
                      <Trash2 size={14} />
                      {t('logs.gps_track_delete')}
                    </button>
                  )}
                </div>
              </div>

              {savedTrack.waypoints.length > 0 && (
                <TrackMap waypoints={savedTrack.waypoints} />
              )}
            </>
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

        <SignatureSection
          readOnly={readOnly}
          disabled={saving}
          isOnline={isOnline}
          isOwner={isOwner}
          hasWriteCollaborators={hasWriteCollaborators}
          signSkipper={signSkipper}
          signCrew={signCrew}
          skipperSignatureValid={skipperSignatureValid}
          crewSignatureValid={crewSignatureValid}
          onSignSkipperChange={setSignSkipper}
          onSignCrewChange={setSignCrew}
          onPasskeySignSkipper={handlePasskeySignSkipper}
          onPasskeySignCrew={handlePasskeySignCrew}
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
            
            <button type="submit" className="btn primary" disabled={saving || !date || !dayOfTravel.trim()}>
              <Save size={18} />
              {saving ? t('logs.saving') : t('logs.save')}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
