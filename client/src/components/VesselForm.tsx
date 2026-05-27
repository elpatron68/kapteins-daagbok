import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { Ship, Save, Check } from 'lucide-react'

interface VesselFormProps {
  logbookId: string
}

export default function VesselForm({ logbookId }: VesselFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [homePort, setHomePort] = useState('')
  const [charterCompany, setCharterCompany] = useState('')
  const [owner, setOwner] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [callSign, setCallSign] = useState('')
  const [atis, setAtis] = useState('')
  const [mmsi, setMmsi] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load E2E encrypted vessel profile on mount
  useEffect(() => {
    async function loadVessel() {
      setLoading(true)
      setError(null)
      try {
        const masterKey = getActiveMasterKey()
        if (!masterKey) throw new Error('Master key not found. Please log in.')

        const local = await db.yachts.get(logbookId)
        if (local) {
          // Decrypt fields
          const decrypted = await decryptJson(local.encryptedData, local.iv, local.tag, masterKey)
          if (decrypted) {
            setName(decrypted.name || '')
            setHomePort(decrypted.homePort || '')
            setCharterCompany(decrypted.charterCompany || '')
            setOwner(decrypted.owner || '')
            setRegistrationNumber(decrypted.registrationNumber || '')
            setCallSign(decrypted.callSign || '')
            setAtis(decrypted.atis || '')
            setMmsi(decrypted.mmsi || '')
          }
        }
      } catch (err: any) {
        console.error('Failed to load vessel data:', err)
        setError(err.message || 'Decryption failed. Could not load vessel data.')
      } finally {
        setLoading(false)
      }
    }

    loadVessel()
  }, [logbookId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const masterKey = getActiveMasterKey()
      if (!masterKey) throw new Error('Master key not found. Please log in.')

      const yachtData = {
        name: name.trim(),
        homePort: homePort.trim(),
        charterCompany: charterCompany.trim(),
        owner: owner.trim(),
        registrationNumber: registrationNumber.trim(),
        callSign: callSign.trim(),
        atis: atis.trim(),
        mmsi: mmsi.trim()
      }

      // E2E encrypt
      const encrypted = await encryptJson(yachtData, masterKey)
      const now = new Date().toISOString()

      // Save locally
      await db.yachts.put({
        logbookId,
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: now
      })

      // Queue for background synchronization
      await db.syncQueue.put({
        action: 'update',
        type: 'yacht',
        payloadId: logbookId,
        logbookId,
        data: JSON.stringify(encrypted),
        updatedAt: now
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)

      // Trigger background sync task
      syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
    } catch (err: any) {
      console.error('Failed to save vessel data:', err)
      setError(err.message || 'Failed to save vessel data.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="tab-placeholder">
        <Ship className="header-logo spin" size={48} />
        <p>{t('vessel.loading')}</p>
      </div>
    )
  }

  return (
    <div className="form-card">
      <div className="form-header">
        <Ship size={24} className="form-icon" />
        <h2>{t('vessel.title')}</h2>
      </div>

      {error && <div className="auth-error mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="vessel-form">
        <div className="form-grid">
          <div className="input-group">
            <label>{t('vessel.name')}</label>
            <input
              type="text"
              className="input-text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="input-group">
            <label>{t('vessel.port')}</label>
            <input
              type="text"
              className="input-text"
              value={homePort}
              onChange={(e) => setHomePort(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label>{t('vessel.owner')}</label>
            <input
              type="text"
              className="input-text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label>{t('vessel.charter')}</label>
            <input
              type="text"
              className="input-text"
              value={charterCompany}
              onChange={(e) => setCharterCompany(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label>{t('vessel.registration')}</label>
            <input
              type="text"
              className="input-text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label>{t('vessel.callsign')}</label>
            <input
              type="text"
              className="input-text"
              value={callSign}
              onChange={(e) => setCallSign(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label>{t('vessel.atis')}</label>
            <input
              type="text"
              className="input-text"
              value={atis}
              onChange={(e) => setAtis(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="input-group">
            <label>{t('vessel.mmsi')}</label>
            <input
              type="text"
              className="input-text"
              value={mmsi}
              onChange={(e) => setMmsi(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-actions">
          {success && (
            <div className="success-toast">
              <Check size={16} />
              <span>{t('vessel.saved')}</span>
            </div>
          )}
          
          <button type="submit" className="btn primary" disabled={saving || !name.trim()}>
            <Save size={18} />
            {saving ? t('vessel.saving') : t('vessel.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
