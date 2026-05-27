import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '../services/db.js'
import { getActiveMasterKey } from '../services/auth.js'
import { encryptJson, decryptJson } from '../services/crypto.js'
import { syncLogbook } from '../services/sync.js'
import { Compass, Save, Check } from 'lucide-react'

interface DeviationFormProps {
  logbookId: string
}

export default function DeviationForm({ logbookId }: DeviationFormProps) {
  const { t } = useTranslation()

  // Generate headings: 0, 10, 20, ..., 360 (37 items)
  const headings = Array.from({ length: 37 }, (_, i) => i * 10)

  // Map representation: heading -> deviation input string (e.g., "1.5", "-2")
  const [deviations, setDeviations] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDeviationTable() {
      setLoading(true)
      setError(null)
      try {
        const masterKey = getActiveMasterKey()
        if (!masterKey) throw new Error('Master key not found. Please log in.')

        const local = await db.deviations.get(logbookId)
        if (local) {
          const decrypted = await decryptJson(local.encryptedData, local.iv, local.tag, masterKey)
          if (decrypted && decrypted.deviations) {
            // Map keys back to numbers and set state
            const map: Record<number, string> = {}
            Object.entries(decrypted.deviations).forEach(([k, v]) => {
              map[Number(k)] = String(v)
            })
            setDeviations(map)
          }
        } else {
          // Initialize empty map
          const map: Record<number, string> = {}
          headings.forEach((h) => {
            map[h] = ''
          })
          setDeviations(map)
        }
      } catch (err: any) {
        console.error('Failed to load deviation data:', err)
        setError(err.message || 'Decryption failed. Could not load deviation table.')
      } finally {
        setLoading(false)
      }
    }

    loadDeviationTable()
  }, [logbookId])

  const handleInputChange = (heading: number, val: string) => {
    setDeviations((prev) => ({
      ...prev,
      [heading]: val
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const masterKey = getActiveMasterKey()
      if (!masterKey) throw new Error('Master key not found. Please log in.')

      // Parse values, substituting 0 if empty
      const sanitizedDeviations: Record<number, number> = {}
      headings.forEach((h) => {
        const val = deviations[h] || ''
        const parsed = parseFloat(val.replace('+', '').trim())
        sanitizedDeviations[h] = isNaN(parsed) ? 0 : parsed
      })

      const dataToSave = {
        deviations: sanitizedDeviations
      }

      // E2E encrypt
      const encrypted = await encryptJson(dataToSave, masterKey)
      const now = new Date().toISOString()

      // Save locally
      await db.deviations.put({
        logbookId,
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        updatedAt: now
      })

      // Queue for background sync
      await db.syncQueue.put({
        action: 'update',
        type: 'deviation',
        payloadId: logbookId,
        logbookId,
        data: JSON.stringify(encrypted),
        updatedAt: now
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)

      syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
    } catch (err: any) {
      console.error('Failed to save deviation table:', err)
      setError(err.message || 'Failed to save deviation table.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="tab-placeholder">
        <Compass className="header-logo spin" size={48} />
        <p>{t('deviation.loading')}</p>
      </div>
    )
  }

  return (
    <div className="form-card">
      <div className="form-header">
        <Compass size={24} className="form-icon" />
        <div>
          <h2>{t('deviation.title')}</h2>
          <p className="form-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            {t('deviation.subtitle')}
          </p>
        </div>
      </div>

      {error && <div className="auth-error mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="vessel-form">
        <div className="deviation-grid-container mt-6">
          {headings.map((h) => {
            const paddedLabel = String(h).padStart(3, '0') + '°'
            return (
              <div key={h} className="deviation-cell">
                <span className="cell-label">{paddedLabel}</span>
                <input
                  type="text"
                  placeholder="0.0"
                  className="input-text cell-input"
                  value={deviations[h] || ''}
                  onChange={(e) => handleInputChange(h, e.target.value)}
                  disabled={saving}
                />
              </div>
            )
          })}
        </div>

        <div className="form-actions mt-6">
          {success && (
            <div className="success-toast">
              <Check size={16} />
              <span>{t('deviation.saved')}</span>
            </div>
          )}
          
          <button type="submit" className="btn primary" disabled={saving}>
            <Save size={18} />
            {saving ? t('deviation.saving') : t('deviation.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
