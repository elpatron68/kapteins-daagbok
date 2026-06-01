import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ship, Save, Check } from 'lucide-react'
import type { LogbookVesselSelectionData, VesselData } from '../types/vessel.js'
import type { DecryptedVessel } from '../services/vesselPool.js'
import { loadVesselPool } from '../services/vesselPool.js'
import { loadLogbookVesselSelection, saveLogbookVesselSelectionFromId } from '../services/logbookVesselSelection.js'
import { resolveVesselForLogbook } from '../services/resolveVessel.js'
import { vesselDataFromSnapshot } from '../utils/vesselSnapshot.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

export interface LogbookVesselPickerProps {
  logbookId: string
  readOnly?: boolean
  preloadedPool?: Array<{ payloadId: string; data: VesselData }>
  preloadedSelection?: LogbookVesselSelectionData
  selectionOnly?: boolean
  onOpenProfile?: () => void
}

export default function LogbookVesselPicker({
  logbookId,
  readOnly = false,
  preloadedPool,
  preloadedSelection,
  selectionOnly = false,
  onOpenProfile
}: LogbookVesselPickerProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(!preloadedSelection)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pool, setPool] = useState<DecryptedVessel[]>([])
  const [activeVesselId, setActiveVesselId] = useState<string | null>(null)
  const [resolvedVessel, setResolvedVessel] = useState<VesselData | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const selection =
        preloadedSelection ??
        (logbookId === 'demo' ? null : await loadLogbookVesselSelection(logbookId))

      if (selection) {
        setActiveVesselId(selection.activeVesselId)
      }

      if (preloadedPool) {
        setPool(preloadedPool.map((p) => ({ payloadId: p.payloadId, data: p.data })))
      } else if (selectionOnly && selection?.vesselSnapshot) {
        const data = vesselDataFromSnapshot(selection.vesselSnapshot)
        if (data) {
          setPool([{ payloadId: selection.vesselSnapshot.id, data }])
        }
      } else {
        setPool(await loadVesselPool())
      }

      const vessel = await resolveVesselForLogbook(logbookId, {
        preloadedSelection: selection ?? undefined
      })
      setResolvedVessel(vessel)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load vessel selection')
    } finally {
      setLoading(false)
    }
  }, [logbookId, preloadedPool, preloadedSelection, selectionOnly])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSave = async () => {
    if (readOnly || logbookId === 'demo') return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const selection = await saveLogbookVesselSelectionFromId(logbookId, activeVesselId)
      const vessel = vesselDataFromSnapshot(selection.vesselSnapshot)
      setResolvedVessel(vessel)
      setSaved(true)
      trackPlausibleEvent(PlausibleEvents.VESSEL_SAVED, { context: 'logbook_selection' })
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
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
    <div className="crew-dashboard-layout" data-tour="logbook-vessel-picker">
      <div className="form-card">
        <div className="form-header">
          <Ship size={24} className="form-icon" />
          <h2>{t('logbook_vessel.title')}</h2>
        </div>
        <p className="help-text mb-4">{t('logbook_vessel.subtitle')}</p>
        {selectionOnly && <p className="help-text mb-4">{t('logbook_vessel.selection_only_hint')}</p>}
        {!selectionOnly && !readOnly && onOpenProfile && (
          <p className="help-text mb-4">
            <button type="button" className="btn-link" onClick={onOpenProfile}>
              {t('logbook_vessel.manage_in_profile')}
            </button>
          </p>
        )}
        {error && <div className="auth-error mb-4">{error}</div>}

        <div className="input-group mb-4">
          <label>{t('logbook_vessel.active_vessel')}</label>
          {pool.length === 0 ? (
            <p className="help-text">{t('logbook_vessel.no_vessels_in_pool')}</p>
          ) : (
            <div className="crew-selection-list">
              {pool.map((v) => (
                <label key={v.payloadId} className="crew-selection-item">
                  <input
                    type="radio"
                    name={`vessel-${logbookId}`}
                    checked={activeVesselId === v.payloadId}
                    onChange={() => !readOnly && setActiveVesselId(v.payloadId)}
                    disabled={readOnly}
                  />
                  <Ship size={16} aria-hidden="true" />
                  <span>{v.data.name || t('logbook_vessel.unnamed')}</span>
                </label>
              ))}
              {!readOnly && (
                <label className="crew-selection-item">
                  <input
                    type="radio"
                    name={`vessel-${logbookId}`}
                    checked={activeVesselId === null}
                    onChange={() => setActiveVesselId(null)}
                  />
                  <span>{t('logbook_vessel.no_vessel')}</span>
                </label>
              )}
            </div>
          )}
        </div>

        {resolvedVessel && (
          <div className="member-editor-card glass mb-4 logbook-vessel-summary">
            <h3 className="mb-2">{resolvedVessel.name}</h3>
            <dl className="profile-dl">
              {resolvedVessel.homePort && (
                <div className="profile-dl-row">
                  <dt>{t('vessel.port')}</dt>
                  <dd>{resolvedVessel.homePort}</dd>
                </div>
              )}
              {resolvedVessel.registrationNumber && (
                <div className="profile-dl-row">
                  <dt>{t('vessel.registration')}</dt>
                  <dd>{resolvedVessel.registrationNumber}</dd>
                </div>
              )}
              {resolvedVessel.mmsi && (
                <div className="profile-dl-row">
                  <dt>{t('vessel.mmsi')}</dt>
                  <dd>{resolvedVessel.mmsi}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {!readOnly && logbookId !== 'demo' && (
          <div className="form-actions">
            {saved && (
              <div className="success-toast">
                <Check size={16} />
                <span>{t('logbook_vessel.saved')}</span>
              </div>
            )}
            <button type="button" className="btn primary" onClick={() => void handleSave()} disabled={saving}>
              <Save size={18} />
              {t('logbook_vessel.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
