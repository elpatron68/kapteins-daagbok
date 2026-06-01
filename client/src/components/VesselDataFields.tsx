import React from 'react'
import { useTranslation } from 'react-i18next'
import { Ship, Camera, Trash2, Plus, X } from 'lucide-react'
import type { VesselFormInputs } from '../utils/vesselFormUtils.js'

export interface VesselDataFieldsProps {
  inputs: VesselFormInputs
  onChange: (next: VesselFormInputs) => void
  readOnly?: boolean
  saving?: boolean
  newSailName: string
  onNewSailNameChange: (value: string) => void
  onAddSail: () => void
  onRemoveSail: (index: number) => void
  photoError?: string | null
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemovePhoto: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}

export default function VesselDataFields({
  inputs,
  onChange,
  readOnly = false,
  saving = false,
  newSailName,
  onNewSailNameChange,
  onAddSail,
  onRemoveSail,
  photoError,
  onPhotoChange,
  onRemovePhoto,
  fileInputRef
}: VesselDataFieldsProps) {
  const { t } = useTranslation()
  const set = (patch: Partial<VesselFormInputs>) => onChange({ ...inputs, ...patch })

  const triggerFileInput = () => {
    if (!readOnly) fileInputRef.current?.click()
  }

  return (
    <div className="form-grid">
      <div className="vessel-photo-wrapper">
        <div
          className="vessel-photo-preview"
          onClick={triggerFileInput}
          style={{ cursor: readOnly ? 'default' : 'pointer' }}
        >
          {inputs.photo ? (
            <img src={inputs.photo} alt={inputs.name || 'Vessel'} className="vessel-photo" />
          ) : (
            <div className="vessel-photo-placeholder">
              <Ship size={48} className="placeholder-icon" />
            </div>
          )}
          {!readOnly && (
            <div className="vessel-photo-overlay">
              <Camera size={24} />
              <span>{inputs.photo ? t('vessel.photo_change') : t('vessel.photo_add')}</span>
            </div>
          )}
        </div>
        {!readOnly && (
          <div className="vessel-photo-actions">
            <button type="button" className="btn secondary btn-sm" onClick={triggerFileInput} disabled={saving}>
              <Camera size={16} />
              {inputs.photo ? t('vessel.photo_change') : t('vessel.photo_add')}
            </button>
            {inputs.photo && (
              <button type="button" className="btn danger btn-sm" onClick={onRemovePhoto} disabled={saving}>
                <Trash2 size={16} />
                {t('vessel.photo_delete')}
              </button>
            )}
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={onPhotoChange}
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
          value={inputs.name}
          onChange={(e) => set({ name: e.target.value })}
          disabled={saving || readOnly}
          required
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.type')}</label>
        <select
          className="input-text"
          value={inputs.vesselType}
          onChange={(e) => set({ vesselType: e.target.value })}
          disabled={saving || readOnly}
        >
          <option value="">{t('vessel.type_unset')}</option>
          <option value="sailing">{t('vessel.type_sailing')}</option>
          <option value="motor">{t('vessel.type_motor')}</option>
        </select>
      </div>

      <div className="input-group">
        <label>{t('vessel.length_m')}</label>
        <input
          type="text"
          inputMode="decimal"
          className="input-text"
          value={inputs.lengthM}
          onChange={(e) => set({ lengthM: e.target.value })}
          disabled={saving || readOnly}
          placeholder="0.00"
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.draft_m')}</label>
        <input
          type="text"
          inputMode="decimal"
          className="input-text"
          value={inputs.draftM}
          onChange={(e) => set({ draftM: e.target.value })}
          disabled={saving || readOnly}
          placeholder="0.00"
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.air_draft_m')}</label>
        <input
          type="text"
          inputMode="decimal"
          className="input-text"
          value={inputs.airDraftM}
          onChange={(e) => set({ airDraftM: e.target.value })}
          disabled={saving || readOnly}
          placeholder="0.00"
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.port')}</label>
        <input
          type="text"
          className="input-text"
          value={inputs.homePort}
          onChange={(e) => set({ homePort: e.target.value })}
          disabled={saving || readOnly}
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.owner')}</label>
        <input
          type="text"
          className="input-text"
          value={inputs.owner}
          onChange={(e) => set({ owner: e.target.value })}
          disabled={saving || readOnly}
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.charter')}</label>
        <input
          type="text"
          className="input-text"
          value={inputs.charterCompany}
          onChange={(e) => set({ charterCompany: e.target.value })}
          disabled={saving || readOnly}
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.registration')}</label>
        <input
          type="text"
          className="input-text"
          value={inputs.registrationNumber}
          onChange={(e) => set({ registrationNumber: e.target.value })}
          disabled={saving || readOnly}
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.callsign')}</label>
        <input
          type="text"
          className="input-text"
          value={inputs.callSign}
          onChange={(e) => set({ callSign: e.target.value })}
          disabled={saving || readOnly}
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.atis')}</label>
        <input
          type="text"
          className="input-text"
          value={inputs.atis}
          onChange={(e) => set({ atis: e.target.value })}
          disabled={saving || readOnly}
        />
      </div>

      <div className="input-group">
        <label>{t('vessel.mmsi')}</label>
        <input
          type="text"
          className="input-text"
          value={inputs.mmsi}
          onChange={(e) => set({ mmsi: e.target.value })}
          disabled={saving || readOnly}
        />
      </div>

      <div className="vessel-tanks-section">
        <h3>{t('vessel.tanks_section')}</h3>
        <p className="vessel-tanks-help">{t('vessel.tanks_help')}</p>
        <div className="vessel-tanks-grid">
          <div className="input-group">
            <label>{t('vessel.freshwater_capacity_l')}</label>
            <input
              type="text"
              inputMode="decimal"
              className="input-text"
              value={inputs.freshwaterCapacityL}
              onChange={(e) => set({ freshwaterCapacityL: e.target.value })}
              disabled={saving || readOnly}
              placeholder="0"
            />
          </div>
          <div className="input-group">
            <label>{t('vessel.fuel_capacity_l')}</label>
            <input
              type="text"
              inputMode="decimal"
              className="input-text"
              value={inputs.fuelCapacityL}
              onChange={(e) => set({ fuelCapacityL: e.target.value })}
              disabled={saving || readOnly}
              placeholder="0"
            />
          </div>
          <div className="input-group">
            <label>{t('vessel.greywater_capacity_l')}</label>
            <input
              type="text"
              inputMode="decimal"
              className="input-text"
              value={inputs.greywaterCapacityL}
              onChange={(e) => set({ greywaterCapacityL: e.target.value })}
              disabled={saving || readOnly}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="sails-section">
        <h3>{t('vessel.sails_list')}</h3>
        <p className="help-text">{t('vessel.sails_help')}</p>
        <div className="sails-badges-grid">
          {inputs.sails.length === 0 ? (
            <span className="no-sails-msg">{t('vessel.no_sails')}</span>
          ) : (
            inputs.sails.map((sail, idx) => (
              <span key={idx} className="sail-badge">
                {sail}
                {!readOnly && (
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => onRemoveSail(idx)}
                    disabled={saving}
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            ))
          )}
        </div>
        {!readOnly && (
          <div className="add-sail-form">
            <input
              type="text"
              className="input-text"
              placeholder={t('vessel.sail_name_placeholder')}
              value={newSailName}
              onChange={(e) => onNewSailNameChange(e.target.value)}
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onAddSail()
                }
              }}
            />
            <button
              type="button"
              className="btn secondary"
              onClick={onAddSail}
              disabled={saving || !newSailName.trim()}
              style={{ width: 'auto' }}
            >
              <Plus size={16} />
              {t('vessel.add_sail')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
