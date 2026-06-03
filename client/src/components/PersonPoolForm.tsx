import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, User, Plus, Trash2, Edit2, X, Camera, Save } from 'lucide-react'
import { useDialog } from './ModalDialog.tsx'
import { resizeImageFile } from '../utils/resizeImageFile.js'
import type { PersonData, PersonRole } from '../types/person.js'
import { MAX_POOL_CREW_MEMBERS } from '../types/person.js'
import {
  loadPersonPool,
  savePerson,
  deletePerson,
  filterSkippers,
  filterCrew,
  type DecryptedPerson
} from '../services/personPool.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

const emptyPerson = (role: PersonRole): PersonData => ({
  name: '',
  address: '',
  birthDate: '',
  phone: '',
  nationality: '',
  passportNumber: '',
  bloodType: '',
  allergies: '',
  diseases: '',
  role,
  photo: null
})

export default function PersonPoolForm() {
  const { t } = useTranslation()
  const { showConfirm } = useDialog()
  const [people, setPeople] = useState<DecryptedPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formRole, setFormRole] = useState<PersonRole>('crew')
  const [form, setForm] = useState<PersonData>(emptyPerson('crew'))
  const [saving, setSaving] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPeople(await loadPersonPool())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const openAdd = (role: PersonRole) => {
    setEditingId(null)
    setFormRole(role)
    setForm(emptyPerson(role))
    setPhotoError(null)
    setShowForm(true)
  }

  const openEdit = (person: DecryptedPerson) => {
    setEditingId(person.payloadId)
    setFormRole(person.data.role)
    setForm({ ...person.data })
    setPhotoError(null)
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const id = editingId ?? window.crypto.randomUUID()
      await savePerson(id, { ...form, role: formRole }, !editingId)
      setShowForm(false)
      trackPlausibleEvent(PlausibleEvents.CREW_SAVED, { role: formRole, context: 'person_pool' })
      await reload()
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'MAX_CREW') {
        setError(t('crew.max_crew'))
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
        t('person_pool.delete_confirm'),
        t('person_pool.title'),
        t('logs.confirm_yes'),
        t('logs.confirm_no')
      ))
    ) {
      return
    }
    try {
      await deletePerson(id)
      await reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const skippers = filterSkippers(people)
  const crewList = filterCrew(people)

  if (loading) {
    return (
      <div className="tab-placeholder">
        <Users className="header-logo spin" size={48} />
        <p>{t('person_pool.loading')}</p>
      </div>
    )
  }

  const renderCard = (person: DecryptedPerson) => (
    <div key={person.payloadId} className="crew-member-card glass">
      <div className="crew-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {person.data.photo ? (
            <img src={person.data.photo} alt="" className="crew-card-avatar" />
          ) : (
            <div className="crew-card-avatar-placeholder">
              <User size={18} />
            </div>
          )}
          <h4>{person.data.name}</h4>
        </div>
        <div className="card-actions">
          <button type="button" className="btn-icon" onClick={() => openEdit(person)} title="Edit">
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            className="btn-icon danger"
            onClick={() => void handleDelete(person.payloadId)}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {person.data.phone && (
        <p className="help-text">
          <strong>{t('crew.phone')}:</strong> {person.data.phone}
        </p>
      )}
    </div>
  )

  return (
    <section className="form-card" data-tour="profile-crew-pool">
      <div className="form-header">
        <Users size={24} className="form-icon" />
        <h2>{t('person_pool.title')}</h2>
      </div>
      <p className="help-text mb-4">{t('person_pool.subtitle')}</p>
      {error && <div className="auth-error mb-4">{error}</div>}

      <div className="section-title-bar mb-4">
        <h3>{t('person_pool.skippers_section')}</h3>
        {!showForm && (
          <button type="button" className="btn primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => openAdd('skipper')}>
            <Plus size={16} />
            {t('person_pool.add_skipper')}
          </button>
        )}
      </div>
      {skippers.length === 0 ? (
        <p className="help-text mb-4">{t('person_pool.no_skippers')}</p>
      ) : (
        <div className="crew-grid mb-6">{skippers.map(renderCard)}</div>
      )}

      <div className="section-title-bar mb-4">
        <h3>{t('person_pool.crew_section')}</h3>
        {!showForm && crewList.length < MAX_POOL_CREW_MEMBERS && (
          <button type="button" className="btn primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => openAdd('crew')}>
            <Plus size={16} />
            {t('person_pool.add_crew')}
          </button>
        )}
      </div>
      {crewList.length === 0 ? (
        <p className="help-text">{t('person_pool.no_crew')}</p>
      ) : (
        <div className="crew-grid">{crewList.map(renderCard)}</div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSave(e)} className="member-editor-card glass mt-6">
          <div className="editor-header mb-4">
            <h3>
              {editingId
                ? formRole === 'skipper'
                  ? t('person_pool.edit_skipper')
                  : t('crew.edit_crew')
                : formRole === 'skipper'
                  ? t('person_pool.add_skipper')
                  : t('crew.add_crew')}
            </h3>
            <button type="button" className="btn-icon" onClick={() => setShowForm(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="form-grid">
            <div className="vessel-photo-wrapper">
              <div className="vessel-photo-preview" onClick={() => fileRef.current?.click()}>
                {form.photo ? (
                  <img src={form.photo} alt="" className="vessel-photo" />
                ) : (
                  <div className="vessel-photo-placeholder">
                    <User size={48} />
                  </div>
                )}
                <div className="vessel-photo-overlay">
                  <Camera size={24} />
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  void resizeImageFile(file)
                    .then((photo) => setForm((f) => ({ ...f, photo })))
                    .catch((err: unknown) => {
                      setPhotoError(err instanceof Error ? err.message : 'Image error')
                    })
                }}
              />
              {photoError && <div className="auth-error mt-2">{photoError}</div>}
            </div>
            <div className="input-group">
              <label>{t('crew.name')} *</label>
              <input
                className="input-text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="input-group">
              <label>{t('crew.address')}</label>
              <input
                className="input-text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label>{t('crew.birthdate')}</label>
              <input
                type="date"
                className="input-text"
                value={form.birthDate}
                onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label>{t('crew.phone')}</label>
              <input
                className="input-text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label>{t('crew.nationality')}</label>
              <input
                className="input-text"
                value={form.nationality}
                onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
              />
            </div>
            <div className="input-group">
              <label>{t('crew.passport')}</label>
              <input
                className="input-text"
                value={form.passportNumber}
                onChange={(e) => setForm((f) => ({ ...f, passportNumber: e.target.value }))}
              />
            </div>
          </div>
          <div className="editor-actions mt-4">
            <button type="submit" className="btn primary" disabled={saving || !form.name.trim()}>
              <Save size={18} />
              {t('crew.save_member')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
