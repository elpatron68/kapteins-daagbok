import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { downloadLogbookPagePdf } from '../services/pdfExport.js'
import { FileText, Save, ChevronLeft, Check, Compass, Plus, Trash2, MapPin, CloudSun, Clock, Download, Play, Square, Navigation } from 'lucide-react'
import PhotoCapture from './PhotoCapture.tsx'
import {
  startGpsTracking,
  stopGpsTracking,
  isGpsTrackingActive,
  getDecryptedGpsTrack,
  downloadGpxFile,
  getDistanceMeters,
  type GpsWaypoint
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
  const { t } = useTranslation()

  // General details state
  const [date, setDate] = useState('')
  const [dayOfTravel, setDayOfTravel] = useState('')
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

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // GPS Tracking States
  const [waypoints, setWaypoints] = useState<GpsWaypoint[]>([])
  const [trackingActive, setTrackingActive] = useState(false)
  const [tick, setTick] = useState(0)

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

  // GPS Tracking logic
  const loadGpsTrack = async () => {
    try {
      const track = await getDecryptedGpsTrack(entryId)
      setWaypoints(track)
    } catch (e) {
      console.warn('Failed to load GPS track:', e)
    }
  }

  useEffect(() => {
    loadGpsTrack()
    setTrackingActive(isGpsTrackingActive(entryId))

    const interval = setInterval(() => {
      setTrackingActive(isGpsTrackingActive(entryId))
      if (isGpsTrackingActive(entryId)) {
        loadGpsTrack()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [entryId])

  useEffect(() => {
    if (!trackingActive) return
    const timer = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [trackingActive])

  const handleStartTracking = async () => {
    try {
      await startGpsTracking(logbookId, entryId, (newWp) => {
        setWaypoints((prev) => [...prev, newWp])
      })
      setTrackingActive(true)
    } catch (err: any) {
      alert(err.message || 'Failed to start GPS tracking')
    }
  }

  const handleStopTracking = () => {
    stopGpsTracking()
    setTrackingActive(false)
    loadGpsTrack()
  }

  const calculateTotalDistanceSailed = () => {
    if (waypoints.length < 2) return 0
    let totalMeters = 0
    for (let i = 1; i < waypoints.length; i++) {
      totalMeters += getDistanceMeters(
        waypoints[i - 1].lat,
        waypoints[i - 1].lng,
        waypoints[i].lat,
        waypoints[i].lng
      )
    }
    return Number((totalMeters / 1852).toFixed(2))
  }

  const calculateDurationStr = () => {
    if (tick < 0 || waypoints.length < 2) return '00:00:00'
    const first = waypoints[0].timestamp
    const last = trackingActive ? Date.now() : waypoints[waypoints.length - 1].timestamp
    const diffMs = last - first
    if (diffMs <= 0) return '00:00:00'
    
    const secs = Math.floor(diffMs / 1000) % 60
    const mins = Math.floor(diffMs / (1000 * 60)) % 60
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEvGpsLat(pos.coords.latitude.toFixed(6))
        setEvGpsLng(pos.coords.longitude.toFixed(6))
      },
      (err) => {
        console.error('GPS capturing failed:', err)
        alert(`Failed to retrieve coordinates: ${err.message}`)
      }
    )
  }

  const handleFetchWeather = async () => {
    if (!evGpsLat || !evGpsLng) {
      alert(t('settings.gps_error'))
      return
    }

    const apiKey = localStorage.getItem('owm_api_key')
    if (!apiKey) {
      alert(t('settings.no_key'))
      return
    }

    setWeatherLoading(true)
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${evGpsLat}&lon=${evGpsLng}&appid=${apiKey}&units=metric`
      )

      if (!res.ok) throw new Error('Weather API rejected the request')

      const data = await res.json()

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

      alert(t('settings.weather_success'))
    } catch (err) {
      console.error('Weather prefilling failed:', err)
      alert(t('settings.weather_error'))
    } finally {
      setWeatherLoading(false)
    }
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
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                <label>{t('logs.event_gps')} (Lat, Lng)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
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
                    disabled={saving || weatherLoading || !evGpsLat || !evGpsLng}
                  >
                    <CloudSun size={16} />
                  </button>
                </div>
              </div>

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
            </div>

            <div className="form-grid mb-4">
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

        {/* GPS Tracking Dashboard */}
        <div className="form-card">
          <div className="form-header">
            <Navigation size={20} className={`form-icon ${trackingActive ? 'spin' : ''}`} style={{ color: trackingActive ? '#10b981' : '#f59e0b', animationDuration: '3s' }} />
            <h3>{t('logs.gps_tracking_title')}</h3>
            <span className={`sync-badge ${trackingActive ? 'synced' : 'local'}`} style={{ marginLeft: 'auto', background: trackingActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)', color: trackingActive ? '#10b981' : '#94a3b8' }}>
              {trackingActive ? t('logs.gps_tracking_status_active') : t('logs.gps_tracking_status_inactive')}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', margin: '16px 0' }}>
            <div className="glass" style={{ padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{t('logs.gps_tracking_stat_duration')}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', color: '#f8fafc' }}>
                {calculateDurationStr()}
              </div>
            </div>

            <div className="glass" style={{ padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{t('logs.gps_tracking_stat_distance')}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc' }}>
                {calculateTotalDistanceSailed()} sm
              </div>
            </div>

            <div className="glass" style={{ padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{t('logs.gps_tracking_stat_waypoints')}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc' }}>
                {waypoints.length}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!trackingActive ? (
              <button
                type="button"
                className="btn primary"
                onClick={handleStartTracking}
                style={{ width: 'auto', padding: '10px 20px', display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <Play size={16} />
                {t('logs.gps_tracking_btn_start')}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={handleStopTracking}
                style={{ width: 'auto', padding: '10px 20px', display: 'flex', gap: '8px', alignItems: 'center', background: '#ef4444' }}
              >
                <Square size={16} />
                {t('logs.gps_tracking_btn_stop')}
              </button>
            )}

            <button
              type="button"
              className="btn secondary"
              onClick={() => downloadGpxFile(waypoints, date)}
              disabled={waypoints.length === 0}
              style={{ width: 'auto', padding: '10px 20px', display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              <Download size={16} />
              {t('logs.gps_tracking_btn_gpx')}
            </button>
          </div>
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
              <label>{t('logs.sign_skipper')} *</label>
              <input
                type="text"
                placeholder="e.g. MARKUS SKIPPER"
                className="input-text"
                value={signSkipper}
                onChange={(e) => setSignSkipper(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div className="input-group">
              <label>{t('logs.sign_crew')} *</label>
              <input
                type="text"
                placeholder="e.g. JAN MATE"
                className="input-text"
                value={signCrew}
                onChange={(e) => setSignCrew(e.target.value)}
                disabled={saving}
                required
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
          
          <button type="submit" className="btn primary" disabled={saving || !date || !dayOfTravel.trim() || !signSkipper.trim() || !signCrew.trim()}>
            <Save size={18} />
            {saving ? t('logs.saving') : t('logs.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
