import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, User, Save, Check } from 'lucide-react'
import type { LogbookCrewSelectionData, PersonSnapshot } from '../types/person.js'
import type { DecryptedPerson } from '../services/personPool.js'
import { loadPersonPool, filterSkippers, filterCrew } from '../services/personPool.js'
import { loadLogbookCrewSelection, saveLogbookCrewSelectionFromIds } from '../services/logbookCrewSelection.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

export interface LogbookCrewPickerProps {
  logbookId: string
  readOnly?: boolean
  /** Demo / share: in-memory pool */
  preloadedPool?: Array<{ payloadId: string; data: DecryptedPerson['data'] }>
  preloadedSelection?: LogbookCrewSelectionData
  /** Shared logbook: only people from selection snapshots */
  selectionOnly?: boolean
}

function snapshotsToPoolList(
  selection: LogbookCrewSelectionData
): Array<{ payloadId: string; data: DecryptedPerson['data'] }> {
  return Object.values(selection.snapshotsById).map((snap) => ({
    payloadId: snap.id,
    data: {
      name: snap.name,
      address: snap.address,
      birthDate: snap.birthDate,
      phone: snap.phone,
      nationality: snap.nationality,
      passportNumber: snap.passportNumber,
      bloodType: snap.bloodType,
      allergies: snap.allergies,
      diseases: snap.diseases,
      role: snap.role,
      photo: snap.photo
    }
  }))
}

export default function LogbookCrewPicker({
  logbookId,
  readOnly = false,
  preloadedPool,
  preloadedSelection,
  selectionOnly = false
}: LogbookCrewPickerProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(!preloadedSelection)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pool, setPool] = useState<DecryptedPerson[]>([])
  const [activeSkipperId, setActiveSkipperId] = useState<string | null>(null)
  const [activeCrewIds, setActiveCrewIds] = useState<string[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const selection =
        preloadedSelection ??
        (logbookId === 'demo' ? null : await loadLogbookCrewSelection(logbookId))

      if (selection) {
        setActiveSkipperId(selection.activeSkipperId)
        setActiveCrewIds([...selection.activeCrewIds])
      }

      if (preloadedPool) {
        setPool(
          preloadedPool.map((p) => ({
            payloadId: p.payloadId,
            data: p.data
          }))
        )
      } else if (selectionOnly && selection) {
        setPool(snapshotsToPoolList(selection))
      } else {
        setPool(await loadPersonPool())
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load crew selection')
    } finally {
      setLoading(false)
    }
  }, [logbookId, preloadedPool, preloadedSelection, selectionOnly])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const skippers = useMemo(() => filterSkippers(pool), [pool])
  const crewMembers = useMemo(() => filterCrew(pool), [pool])

  const toggleCrew = (id: string) => {
    if (readOnly) return
    setActiveCrewIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    if (readOnly || logbookId === 'demo') return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveLogbookCrewSelectionFromIds(logbookId, activeSkipperId, activeCrewIds)
      setSaved(true)
      trackPlausibleEvent(PlausibleEvents.CREW_SAVED, { context: 'logbook_selection' })
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
        <Users className="header-logo spin" size={48} />
        <p>{t('person_pool.loading')}</p>
      </div>
    )
  }

  return (
    <div className="crew-dashboard-layout" data-tour="logbook-crew-picker">
      <div className="form-card">
        <div className="form-header">
          <Users size={24} className="form-icon" />
          <h2>{t('logbook_crew.title')}</h2>
        </div>
        <p className="help-text mb-4">{t('logbook_crew.subtitle')}</p>
        {selectionOnly && <p className="help-text mb-4">{t('logbook_crew.selection_only_hint')}</p>}
        {error && <div className="auth-error mb-4">{error}</div>}

        <div className="input-group mb-4">
          <label>{t('logbook_crew.active_skipper')}</label>
          {skippers.length === 0 ? (
            <p className="help-text">{t('logbook_crew.no_skippers_in_pool')}</p>
          ) : (
            <div className="crew-selection-list">
              {skippers.map((s) => (
                <label key={s.payloadId} className="crew-selection-item">
                  <input
                    type="radio"
                    name={`skipper-${logbookId}`}
                    checked={activeSkipperId === s.payloadId}
                    onChange={() => !readOnly && setActiveSkipperId(s.payloadId)}
                    disabled={readOnly}
                  />
                  <User size={16} aria-hidden="true" />
                  <span>{s.data.name || t('logbook_crew.unnamed')}</span>
                </label>
              ))}
              {!readOnly && (
                <label className="crew-selection-item">
                  <input
                    type="radio"
                    name={`skipper-${logbookId}`}
                    checked={activeSkipperId === null}
                    onChange={() => setActiveSkipperId(null)}
                  />
                  <span>{t('logbook_crew.no_skipper')}</span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="input-group mb-4">
          <label>{t('logbook_crew.active_crew')}</label>
          {crewMembers.length === 0 ? (
            <p className="help-text">{t('logbook_crew.no_crew_in_pool')}</p>
          ) : (
            <div className="crew-selection-list">
              {crewMembers.map((c) => (
                <label key={c.payloadId} className="crew-selection-item">
                  <input
                    type="checkbox"
                    checked={activeCrewIds.includes(c.payloadId)}
                    onChange={() => toggleCrew(c.payloadId)}
                    disabled={readOnly}
                  />
                  <span>{c.data.name || t('logbook_crew.unnamed')}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {!readOnly && logbookId !== 'demo' && (
          <div className="form-actions">
            {saved && (
              <div className="success-toast">
                <Check size={16} />
                <span>{t('logbook_crew.saved')}</span>
              </div>
            )}
            <button type="button" className="btn primary" onClick={() => void handleSave()} disabled={saving}>
              <Save size={18} />
              {t('logbook_crew.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function selectionFromSnapshots(
  snapshotsById: Record<string, PersonSnapshot>
): LogbookCrewSelectionData {
  const snapshots = Object.values(snapshotsById)
  const skipper = snapshots.find((s) => s.role === 'skipper')
  return {
    activeSkipperId: skipper?.id ?? null,
    activeCrewIds: snapshots.filter((s) => s.role === 'crew').map((s) => s.id),
    snapshotsById
  }
}
