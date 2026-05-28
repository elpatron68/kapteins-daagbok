import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { getLogbookKey } from '../services/logbookKeys.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { Ship, Save, Check, Plus, X, Camera, Trash2 } from 'lucide-react'

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
  const [sails, setSails] = useState<string[]>([])
  const [newSailName, setNewSailName] = useState('')

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

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
        const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
        if (!masterKey) throw new Error('Encryption key not found. Please log in.')

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
            setSails(decrypted.sails || [])
            setPhoto(decrypted.photo || null)
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

  const handleAddSail = () => {
    const trimmed = newSailName.trim()
    if (trimmed && !sails.includes(trimmed)) {
      setSails([...sails, trimmed])
    }
    setNewSailName('')
  }

  const handleRemoveSail = (indexToRemove: number) => {
    setSails(sails.filter((_, idx) => idx !== indexToRemove))
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleRemovePhoto = () => {
    setPhoto(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoError(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Could not get canvas context')

          let width = img.width
          let height = img.height
          const MAX_WIDTH = 800
          const MAX_HEIGHT = 600

          // Calculate resizing conserving aspect ratio
          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          // Compress to JPEG, 70% quality
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7)
          setPhoto(compressedBase64)
        } catch (err: any) {
          console.error('Failed to resize yacht photo:', err)
          setPhotoError(err.message || 'Failed to process image')
        }
      }
      img.onerror = () => {
        setPhotoError('Invalid image file')
      }
      img.src = event.target?.result as string
    }
    reader.onerror = () => {
      setPhotoError('Failed to read file')
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
      if (!masterKey) throw new Error('Encryption key not found. Please log in.')

      const yachtData = {
        name: name.trim(),
        homePort: homePort.trim(),
        charterCompany: charterCompany.trim(),
        owner: owner.trim(),
        registrationNumber: registrationNumber.trim(),
        callSign: callSign.trim(),
        atis: atis.trim(),
        mmsi: mmsi.trim(),
        sails: sails,
        photo: photo
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
          <div className="vessel-photo-wrapper">
            <div className="vessel-photo-preview" onClick={triggerFileInput}>
              {photo ? (
                <img src={photo} alt={name || 'Yacht'} className="vessel-photo" />
              ) : (
                <div className="vessel-photo-placeholder">
                  <Ship size={48} className="placeholder-icon" />
                </div>
              )}
              <div className="vessel-photo-overlay">
                <Camera size={24} />
                <span>{photo ? t('vessel.photo_change') : t('vessel.photo_add')}</span>
              </div>
            </div>
            
            <div className="vessel-photo-actions">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={triggerFileInput}
                disabled={saving}
              >
                <Camera size={16} />
                {photo ? t('vessel.photo_change') : t('vessel.photo_add')}
              </button>
              
              {photo && (
                <button
                  type="button"
                  className="btn danger btn-sm"
                  onClick={handleRemovePhoto}
                  disabled={saving}
                >
                  <Trash2 size={16} />
                  {t('vessel.photo_delete')}
                </button>
              )}
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            {photoError && <div className="auth-error mt-2">{photoError}</div>}
          </div>

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

          <div className="sails-section">
            <h3>{t('vessel.sails_list')}</h3>
            <p className="help-text">{t('vessel.sails_help')}</p>
            
            <div className="sails-badges-grid">
              {sails.length === 0 ? (
                <span className="no-sails-msg">{t('vessel.no_sails')}</span>
              ) : (
                sails.map((sail, idx) => (
                  <span key={idx} className="sail-badge">
                    {sail}
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => handleRemoveSail(idx)}
                      disabled={saving}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))
              )}
            </div>

            <div className="add-sail-form">
              <input
                type="text"
                className="input-text"
                placeholder={t('vessel.sail_name_placeholder')}
                value={newSailName}
                onChange={(e) => setNewSailName(e.target.value)}
                disabled={saving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSail();
                  }
                }}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={handleAddSail}
                disabled={saving || !newSailName.trim()}
                style={{ width: 'auto' }}
              >
                <Plus size={16} />
                {t('vessel.add_sail')}
              </button>
            </div>
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
