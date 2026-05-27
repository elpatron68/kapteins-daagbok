import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { FileText, Save, ChevronLeft, Check, Compass } from 'lucide-react'

interface LogEntryEditorProps {
  entryId: string
  logbookId: string
  onBack: () => void
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

  // Events (to preserve Plan 03-03 journal events when editing headers/consumption)
  const [events, setEvents] = useState<any[]>([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Load entry
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
    <div className="form-card">
      <div className="section-title-bar mb-4">
        <button className="btn-back" onClick={onBack} style={{ padding: '6px 12px' }}>
          <ChevronLeft size={16} />
          {t('logs.back_to_list')}
        </button>
        <div className="form-header" style={{ margin: 0 }}>
          <FileText size={24} className="form-icon" />
          <h2>{t('logs.new_entry')} / {dayOfTravel}</h2>
        </div>
      </div>

      {error && <div className="auth-error mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="vessel-form">
        {/* Section 1: Travel Day Headers */}
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
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        {/* Section 2: Freshwater and Fuel Consumption */}
        <div className="form-grid mt-4">
          {/* Freshwater card */}
          <div className="member-editor-card glass">
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#fbbf24' }}>{t('logs.freshwater')}</h3>
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
                  className="input-text cell-input"
                  style={{ color: '#4ade80', fontWeight: 'bold' }}
                  value={fwConsumption}
                  disabled
                />
              </div>
            </div>
          </div>

          {/* Fuel card */}
          <div className="member-editor-card glass">
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#fbbf24' }}>{t('logs.fuel')}</h3>
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
                  className="input-text cell-input"
                  style={{ color: '#4ade80', fontWeight: 'bold' }}
                  value={fuelConsumption}
                  disabled
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Sign-Off Signatures */}
        <div className="member-editor-card glass mt-4">
          <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#fbbf24' }}>{t('logs.signatures')}</h3>
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

        {/* Section 4: Logbook journal events placeholder */}
        <div className="member-editor-card glass mt-4" style={{ borderStyle: 'dashed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
            <Compass size={18} />
            <span style={{ fontSize: '13.5px', fontWeight: 500 }}>
              Journal Events and GPS tracking coordinates will be configured here in Plan 03-03.
            </span>
          </div>
        </div>

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
