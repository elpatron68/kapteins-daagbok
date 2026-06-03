import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ship, Plus, Trash2, Edit2, X, Save } from 'lucide-react'
import { useDialog } from './ModalDialog.tsx'
import VesselDataFields from './VesselDataFields.tsx'
import type { VesselFormInputs } from '../utils/vesselFormUtils.js'
import { parseVesselFormInputs, vesselDataToFormInputs } from '../utils/vesselFormUtils.js'
import { emptyVesselData } from '../types/vessel.js'
import { loadVesselPool, saveVessel, deleteVessel, type DecryptedVessel } from '../services/vesselPool.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

export default function VesselPoolForm() {
  const { t } = useTranslation()
  const { showConfirm } = useDialog()
  const [vessels, setVessels] = useState<DecryptedVessel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inputs, setInputs] = useState<VesselFormInputs>(vesselDataToFormInputs(emptyVesselData()))
  const [newSailName, setNewSailName] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setVessels(await loadVesselPool())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const openAdd = () => {
    setEditingId(null)
    setInputs(vesselDataToFormInputs(emptyVesselData()))
    setNewSailName('')
    setPhotoError(null)
    setShowForm(true)
  }

  const openEdit = (vessel: DecryptedVessel) => {
    setEditingId(vessel.payloadId)
    setInputs(vesselDataToFormInputs(vessel.data))
    setNewSailName('')
    setPhotoError(null)
    setShowForm(true)
  }

  const handleAddSail = () => {
    const trimmed = newSailName.trim()
    if (trimmed && !inputs.sails.includes(trimmed)) {
      setInputs((prev) => ({ ...prev, sails: [...prev.sails, trimmed] }))
    }
    setNewSailName('')
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
          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }
          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)
          setInputs((prev) => ({ ...prev, photo: canvas.toDataURL('image/jpeg', 0.7) }))
        } catch (err: unknown) {
          setPhotoError(err instanceof Error ? err.message : 'Failed to process image')
        }
      }
      img.onerror = () => setPhotoError('Invalid image file')
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputs.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const data = parseVesselFormInputs(inputs)
      const id = editingId ?? window.crypto.randomUUID()
      await saveVessel(id, data, !editingId)
      setShowForm(false)
      trackPlausibleEvent(PlausibleEvents.VESSEL_SAVED, { context: 'vessel_pool' })
      await reload()
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'MAX_VESSELS') {
        setError(t('vessel_pool.max_vessels'))
      } else if (err instanceof Error && err.message === 'invalid_metric') {
        setError(t('vessel.invalid_metric'))
      } else if (err instanceof Error && err.message === 'invalid_tank_liters') {
        setError(t('vessel.invalid_tank_liters'))
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (
      !(await showConfirm(
        t('vessel_pool.delete_confirm'),
        t('vessel_pool.title'),
        t('logs.confirm_yes'),
        t('logs.confirm_no')
      ))
    ) {
      return
    }
    try {
      await deleteVessel(id)
      await reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="tab-placeholder">
        <Ship className="header-logo spin" size={48} />
        <p>{t('vessel_pool.loading')}</p>
      </div>
    )
  }

  return (
    <div data-tour="profile-vessel-pool">
      <div className="section-title-bar mb-4">
        <h3>{t('vessel_pool.section_title')}</h3>
        {!showForm && (
          <button type="button" className="btn primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={openAdd}>
            <Plus size={16} />
            {t('vessel_pool.add_vessel')}
          </button>
        )}
      </div>
      <p className="help-text mb-4">{t('vessel_pool.subtitle')}</p>
      {error && <div className="auth-error mb-4">{error}</div>}

      {vessels.length === 0 ? (
        <p className="help-text mb-4">{t('vessel_pool.no_vessels')}</p>
      ) : (
        <div className="crew-grid mb-6">
          {vessels.map((v) => (
            <div key={v.payloadId} className="crew-member-card glass">
              <div className="crew-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {v.data.photo ? (
                    <img src={v.data.photo} alt="" className="crew-card-avatar" />
                  ) : (
                    <div className="crew-card-avatar-placeholder">
                      <Ship size={18} />
                    </div>
                  )}
                  <div>
                    <h4>{v.data.name}</h4>
                    {v.data.homePort && <p className="help-text">{v.data.homePort}</p>}
                  </div>
                </div>
                <div className="card-actions">
                  <button type="button" className="btn-icon" onClick={() => openEdit(v)}>
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon danger"
                    onClick={() => void handleDelete(v.payloadId)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSave(e)} className="member-editor-card glass">
          <div className="editor-header mb-4">
            <h3>{editingId ? t('vessel_pool.edit_vessel') : t('vessel_pool.add_vessel')}</h3>
            <button type="button" className="btn-icon" onClick={() => setShowForm(false)}>
              <X size={16} />
            </button>
          </div>
          <VesselDataFields
            inputs={inputs}
            onChange={setInputs}
            saving={saving}
            newSailName={newSailName}
            onNewSailNameChange={setNewSailName}
            onAddSail={handleAddSail}
            onRemoveSail={(idx) =>
              setInputs((prev) => ({ ...prev, sails: prev.sails.filter((_, i) => i !== idx) }))
            }
            photoError={photoError}
            onPhotoChange={handlePhotoChange}
            onRemovePhoto={() => {
              setInputs((prev) => ({ ...prev, photo: null }))
              if (fileRef.current) fileRef.current.value = ''
            }}
            fileInputRef={fileRef}
          />
          <div className="form-actions mt-4">
            <button type="submit" className="btn primary" disabled={saving || !inputs.name.trim()}>
              <Save size={18} />
              {saving ? t('vessel.saving') : t('vessel.save')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
