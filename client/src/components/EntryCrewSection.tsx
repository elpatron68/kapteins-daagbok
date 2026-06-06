import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, ChevronDown, ChevronUp } from 'lucide-react'
import type { EntryCrewFields, PersonSnapshot } from '../types/person.js'
import { loadPersonPool } from '../services/personPool.js'
import { loadLogbookCrewSelection } from '../services/logbookCrewSelection.js'
import { buildSnapshotsForSelection } from '../utils/personSnapshots.js'
import type { PersonData } from '../types/person.js'

export interface EntryCrewSectionProps {
  logbookId: string
  readOnly?: boolean
  value: EntryCrewFields
  onChange: (next: EntryCrewFields) => void
  /** Demo: fixed pool */
  preloadedPool?: Map<string, PersonData>
}

export default function EntryCrewSection({
  logbookId,
  readOnly = false,
  value,
  onChange,
  preloadedPool
}: EntryCrewSectionProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(true)
  const [pool, setPool] = useState<Map<string, PersonData>>(preloadedPool ?? new Map())

  useEffect(() => {
    if (preloadedPool) {
      setPool(preloadedPool)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const people = await loadPersonPool()
        if (cancelled) return
        setPool(new Map(people.map((p) => [p.payloadId, p.data])))
      } catch {
        /* use snapshots only */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [preloadedPool])

  const displayPool = useMemo(() => {
    const merged = new Map(pool)
    for (const snap of Object.values(value.crewSnapshotsById)) {
      if (!merged.has(snap.id)) {
        merged.set(snap.id, {
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
        })
      }
    }
    return merged
  }, [pool, value.crewSnapshotsById])

  const skippers = [...displayPool.entries()].filter(([, d]) => d.role === 'skipper')
  const crewEntries = [...displayPool.entries()].filter(([, d]) => d.role === 'crew')

  const applyChange = (skipperId: string | null, crewIds: string[]) => {
    const snapshots = buildSnapshotsForSelection(skipperId, crewIds, displayPool)
    onChange({
      selectedSkipperId: skipperId,
      selectedCrewIds: crewIds,
      crewSnapshotsById: snapshots
    })
  }

  const toggleCrew = (id: string) => {
    if (readOnly) return
    const next = value.selectedCrewIds.includes(id)
      ? value.selectedCrewIds.filter((x) => x !== id)
      : [...value.selectedCrewIds, id]
    applyChange(value.selectedSkipperId, next)
  }

  return (
    <div className="form-card" data-tour="entry-crew">
      <div
        className="form-header accordion-header"
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setCollapsed(!collapsed)
          }
        }}
        role="button"
        aria-expanded={!collapsed}
        tabIndex={0}
      >
        <div className="accordion-header-title">
          <Users size={22} className="form-icon" />
          <h3>{t('entry_crew.title')}</h3>
        </div>
        {collapsed ? (
          <ChevronDown size={20} className="accordion-chevron" />
        ) : (
          <ChevronUp size={20} className="accordion-chevron" />
        )}
      </div>

      {!collapsed && (
        <>
          <p className="help-text mb-3" style={{ marginTop: '16px' }}>{t('entry_crew.subtitle')}</p>

          <div className="input-group mb-3">
            <label>{t('entry_crew.day_skipper')}</label>
            {skippers.length === 0 ? (
              <p className="help-text">{t('entry_crew.no_skipper')}</p>
            ) : (
              <div className="crew-selection-list">
                {skippers.map(([id, data]) => (
                  <label key={id} className="crew-selection-item">
                    <input
                      type="radio"
                      name={`entry-skipper-${logbookId}`}
                      checked={value.selectedSkipperId === id}
                      onChange={() => !readOnly && applyChange(id, value.selectedCrewIds)}
                      disabled={readOnly}
                    />
                    <span>{data.name || t('logbook_crew.unnamed')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="input-group">
            <label>{t('entry_crew.day_crew')}</label>
            {crewEntries.length === 0 ? (
              <p className="help-text">{t('entry_crew.no_crew')}</p>
            ) : (
              <div className="crew-selection-list">
                {crewEntries.map(([id, data]) => (
                  <label key={id} className="crew-selection-item">
                    <input
                      type="checkbox"
                      checked={value.selectedCrewIds.includes(id)}
                      onChange={() => toggleCrew(id)}
                      disabled={readOnly}
                    />
                    <span>{data.name || t('logbook_crew.unnamed')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export async function loadDefaultEntryCrewForNewDay(
  logbookId: string,
  previousEntry: Record<string, unknown> | null
): Promise<EntryCrewFields> {
  if (previousEntry) {
    const selectedSkipperId =
      typeof previousEntry.selectedSkipperId === 'string' ? previousEntry.selectedSkipperId : null
    const selectedCrewIds = Array.isArray(previousEntry.selectedCrewIds)
      ? previousEntry.selectedCrewIds.filter((id): id is string => typeof id === 'string')
      : []
    const crewSnapshotsById =
      previousEntry.crewSnapshotsById && typeof previousEntry.crewSnapshotsById === 'object'
        ? (previousEntry.crewSnapshotsById as Record<string, PersonSnapshot>)
        : {}
    return { selectedSkipperId, selectedCrewIds, crewSnapshotsById }
  }

  const selection = await loadLogbookCrewSelection(logbookId)
  return {
    selectedSkipperId: selection.activeSkipperId,
    selectedCrewIds: [...selection.activeCrewIds],
    crewSnapshotsById: { ...selection.snapshotsById }
  }
}
