import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { downloadLogbookPagePdf } from '../services/pdfExport.js'
import { FileText, Save, ChevronLeft, Check, Compass, Plus, Trash2, MapPin, CloudSun, Clock, Download, Navigation } from 'lucide-react'
import PhotoCapture from './PhotoCapture.tsx'
import { useDialog } from './ModalDialog.tsx'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  getDecryptedGpsTrack,
  saveUploadedGpsTrack,
  deleteGpsTrack,
  downloadTrackFile,
  parseTrackFile,
  type GpsWaypoint,
  type SavedGpsTrack
} from '../services/gpsTracker.js'

interface LogEntryEditorProps {
  entryId: string
  logbookId: string
  onBack: () => void
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

export default function LogEntryEditor({ entryId, logbookId, onBack }: LogEntryEditorProps) {
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
  const [signSkipper, setSignSkipper] = useState('')
  const [signCrew, setSignCrew] = useState('')

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

  // GPS Tracking States
  const [savedTrack, setSavedTrack] = useState<SavedGpsTrack | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

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
      try {
        const masterKey = getActiveMasterKey()
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
  }, [logbookId])

  // Load entry details
  useEffect(() => {
    async function loadEntry() {
      setLoading(true)
      setError(null)
      try {
        const masterKey = getActiveMasterKey()
        if (!masterKey) throw new Error('Master key not found. Please log in.')

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

            setSignSkipper(decrypted.signSkipper || '')
            setSignCrew(decrypted.signCrew || '')
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
  }, [entryId])

  // GPS Track Loader
  const loadGpsTrack = async () => {
    try {
      const track = await getDecryptedGpsTrack(entryId)
      setSavedTrack(track)
    } catch (e) {
      console.warn('Failed to load GPS track:', e)
    }
  }

  useEffect(() => {
    loadGpsTrack()
  }, [entryId])

  // Leaflet Map Initialization and Rendering
  useEffect(() => {
    if (!savedTrack || !savedTrack.waypoints || savedTrack.waypoints.length === 0 || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      return
    }

    const startWp = savedTrack.waypoints[0]
    const map = L.map(mapContainerRef.current).setView([startWp.lat, startWp.lng], 13)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map)

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: 'Map data &copy; <a href="http://openseamap.org">OpenSeaMap</a> contributors'
    }).addTo(map)

    const latLngs = savedTrack.waypoints.map((wp) => [wp.lat, wp.lng] as [number, number])

    const polyline = L.polyline(latLngs, {
      color: '#fbbf24',
      weight: 4,
      opacity: 0.85
    }).addTo(map)

    map.fitBounds(polyline.getBounds(), { padding: [20, 20] })

    if (savedTrack.waypoints.length > 0) {
      L.circleMarker(latLngs[0], {
        radius: 8,
        fillColor: '#10b981',
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 2
      }).addTo(map).bindPopup('Start Position')

      if (savedTrack.waypoints.length > 1) {
        L.circleMarker(latLngs[latLngs.length - 1], {
          radius: 8,
          fillColor: '#ef4444',
          fillOpacity: 0.9,
          color: '#ffffff',
          weight: 2
        }).addTo(map).bindPopup('End Position')
      }
    }

    setTimeout(() => {
      map.invalidateSize()
    }, 100)

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [savedTrack])

  // GPX/KML/GeoJSON Upload Handlers
  const handleFileUpload = async (file: File) => {
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

        await saveUploadedGpsTrack(logbookId, entryId, text, parsedWps, file.name, fileType)
        await loadGpsTrack()
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
    if (!window.confirm(t('logs.gps_track_delete_confirm'))) {
      return
    }
    try {
      await deleteGpsTrack(logbookId, entryId)
      setSavedTrack(null)
      setUploadError(null)
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete track')
    }
  }

  const calculateTrackDistance = (wps: GpsWaypoint[]) => {
    if (wps.length < 2) return 0
    let totalMeters = 0
    for (let i = 1; i < wps.length; i++) {
      const lat1 = wps[i - 1].lat
      const lon1 = wps[i - 1].lng
      const lat2 = wps[i].lat
      const lon2 = wps[i].lng
      
      const R = 6371e3
      const phi1 = (lat1 * Math.PI) / 180
      const phi2 = (lat2 * Math.PI) / 180
      const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
      const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

      const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      totalMeters += R * c
    }
    return Number((totalMeters / 1852).toFixed(2))
  }

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      showAlert('Geolocation is not supported by your browser')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEvGpsLat(pos.coords.latitude.toFixed(6))
        setEvGpsLng(pos.coords.longitude.toFixed(6))
      },
      (err) => {
        console.error('GPS capturing failed:', err)
        showAlert(`Failed to retrieve coordinates: ${err.message}`)
      }
    )
  }

  const handleFetchWeather = async () => {
    const hasGps = evGpsLat && evGpsLng
    const hasLocation = evLocationName.trim()

    if (!hasGps && !hasLocation) {
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
      if (hasLocation) {
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(evLocationName.trim())}&appid=${apiKey}&units=metric`
      } else {
        url = `https://api.openweathermap.org/data/2.5/weather?lat=${evGpsLat}&lon=${evGpsLng}&appid=${apiKey}&units=metric`
      }

      const res = await fetch(url)

      if (!res.ok) throw new Error('Weather API rejected the request')

      const data = await res.json()

      // If fetched by location, automatically pre-fill GPS coordinates
      if (hasLocation && data.coord) {
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
    if (!evTime) return

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
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const masterKey = getActiveMasterKey()
      if (!masterKey) throw new Error('Master key not found. Please log in.')

      const entryData = {
        date,
        dayOfTravel: dayOfTravel.trim(),
        departure: departure.trim(),
        destination: destination.trim(),
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
        signSkipper: signSkipper.trim(),
        signCrew: signCrew.trim(),
        events
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
            <h3>Travel Details</h3>
          </div>
          <div className="form-grid">
            <div className="input-group">
              <label>{t('logs.date')}</label>
              <input
                type="date"
                className="input-text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div className="input-group">
              <label>{t('logs.day_of_travel')} *</label>
              <input
                type="text"
                className="input-text"
                placeholder="e.g. 1"
                value={dayOfTravel}
                onChange={(e) => setDayOfTravel(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div className="input-group">
              <label>{t('logs.departure')}</label>
              <input
                type="text"
                className="input-text"
                placeholder="Starting port name"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="input-group">
              <label>{t('logs.destination')}</label>
              <input
                type="text"
                className="input-text"
                placeholder="Destination port name"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={saving}
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
                <label>{t('logs.morning')} (L)</label>
                <input
                  type="number"
                  step="any"
                  className="input-text"
                  value={fwMorning}
                  onChange={(e) => setFwMorning(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.refilled')} (L)</label>
                <input
                  type="number"
                  step="any"
                  className="input-text"
                  value={fwRefilled}
                  onChange={(e) => setFwRefilled(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.evening')} (L)</label>
                <input
                  type="number"
                  step="any"
                  className="input-text"
                  value={fwEvening}
                  onChange={(e) => setFwEvening(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.consumption')} (L)</label>
                <input
                  type="text"
                  className="input-text cell-input text-green"
                  style={{ color: '#4ade80', fontWeight: 'bold' }}
                  value={fwConsumption}
                  disabled
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
                <label>{t('logs.morning')} (L)</label>
                <input
                  type="number"
                  step="any"
                  className="input-text"
                  value={fuelMorning}
                  onChange={(e) => setFuelMorning(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.refilled')} (L)</label>
                <input
                  type="number"
                  step="any"
                  className="input-text"
                  value={fuelRefilled}
                  onChange={(e) => setFuelRefilled(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.evening')} (L)</label>
                <input
                  type="number"
                  step="any"
                  className="input-text"
                  value={fuelEvening}
                  onChange={(e) => setFuelEvening(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="input-group">
                <label>{t('logs.consumption')} (L)</label>
                <input
                  type="text"
                  className="input-text cell-input text-green"
                  style={{ color: '#4ade80', fontWeight: 'bold' }}
                  value={fuelConsumption}
                  disabled
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
                    <th></th>
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
                      <td>
                        <button type="button" className="btn-icon logout" onClick={() => handleDeleteEvent(idx)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add New Event Form Sub-Card */}
          <div className="member-editor-card glass">
            <h4 style={{ margin: '0 0 16px 0', color: '#fbbf24' }}>Add Event Log Record</h4>
            
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
                    disabled={saving || weatherLoading || (!evLocationName.trim() && (!evGpsLat || !evGpsLng))}
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
        </div>

        {/* GPS Track Upload & Map Visualization */}
        <div className="form-card">
          <div className="form-header">
            <Navigation size={20} className="form-icon" />
            <h3>{t('logs.gps_tracking_title')}</h3>
          </div>

          {uploadError && <div className="track-error-msg">{uploadError}</div>}

          {!savedTrack ? (
            /* Upload Zone when no track is loaded */
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
              <Download size={36} className="track-upload-icon" />
              <div className="track-upload-text">{t('logs.gps_track_upload_btn')}</div>
              <div className="track-upload-subtext">{t('logs.gps_track_upload_help')}</div>
            </div>
          ) : (
            /* Map and Details when track is loaded */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="track-info-header">
                <div className="track-info-left">
                  <Navigation size={16} style={{ color: '#fbbf24' }} />
                  <span className="track-info-name">{savedTrack.filename || 'track'}</span>
                </div>
                <div className="track-info-stats">
                  <span style={{ marginRight: '12px' }}>
                    {t('logs.gps_tracking_stat_distance')}: <strong>{calculateTrackDistance(savedTrack.waypoints)} sm</strong>
                  </span>
                  <span>
                    {t('logs.gps_tracking_stat_waypoints')}: <strong>{savedTrack.waypoints.length}</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => downloadTrackFile(savedTrack)}
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Download size={14} />
                    {t('logs.gps_tracking_btn_gpx')}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleDeleteTrack}
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                  >
                    <Trash2 size={14} />
                    {t('logs.gps_track_delete')}
                  </button>
                </div>
              </div>

              {/* Leaflet Map Div */}
              <div id="openseamap-container" ref={mapContainerRef} />
            </div>
          )}
        </div>

        <PhotoCapture entryId={entryId} logbookId={logbookId} />

        {/* Section 4: Sign-Off Signatures */}
        <div className="form-card">
          <div className="form-header">
            <Check size={20} className="form-icon" />
            <h3>{t('logs.signatures')}</h3>
          </div>
          <div className="form-grid">
            <div className="input-group">
              <label>{t('logs.sign_skipper')}</label>
              <input
                type="text"
                placeholder="e.g. MARKUS SKIPPER"
                className="input-text"
                value={signSkipper}
                onChange={(e) => setSignSkipper(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="input-group">
              <label>{t('logs.sign_crew')}</label>
              <input
                type="text"
                placeholder="e.g. JAN MATE"
                className="input-text"
                value={signCrew}
                onChange={(e) => setSignCrew(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        {/* Save Controls */}
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
      </form>
    </div>
  )
}
