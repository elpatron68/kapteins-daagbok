import type { LogbookCrewSelectionData, PersonData, PersonSnapshot } from '../types/person.js'

export function personToSnapshot(id: string, data: PersonData): PersonSnapshot {
  return {
    id,
    role: data.role,
    name: data.name,
    address: data.address,
    birthDate: data.birthDate,
    phone: data.phone,
    nationality: data.nationality,
    passportNumber: data.passportNumber,
    bloodType: data.bloodType,
    allergies: data.allergies,
    diseases: data.diseases,
    photo: data.photo ?? null
  }
}

export function buildSnapshotsForSelection(
  activeSkipperId: string | null,
  activeCrewIds: string[],
  pool: Map<string, PersonData>
): Record<string, PersonSnapshot> {
  const snapshotsById: Record<string, PersonSnapshot> = {}
  if (activeSkipperId) {
    const skipper = pool.get(activeSkipperId)
    if (skipper) snapshotsById[activeSkipperId] = personToSnapshot(activeSkipperId, skipper)
  }
  for (const crewId of activeCrewIds) {
    const crew = pool.get(crewId)
    if (crew) snapshotsById[crewId] = personToSnapshot(crewId, crew)
  }
  return snapshotsById
}

export function buildLogbookCrewSelection(
  activeSkipperId: string | null,
  activeCrewIds: string[],
  pool: Map<string, PersonData>
): LogbookCrewSelectionData {
  return {
    activeSkipperId,
    activeCrewIds: [...activeCrewIds],
    snapshotsById: buildSnapshotsForSelection(activeSkipperId, activeCrewIds, pool)
  }
}

export function entryCrewFromLogbookSelection(
  selection: LogbookCrewSelectionData
): {
  selectedSkipperId: string | null
  selectedCrewIds: string[]
  crewSnapshotsById: Record<string, PersonSnapshot>
} {
  return {
    selectedSkipperId: selection.activeSkipperId,
    selectedCrewIds: [...selection.activeCrewIds],
    crewSnapshotsById: { ...selection.snapshotsById }
  }
}

export function entryCrewFromPreviousEntry(entry: Record<string, unknown>): {
  selectedSkipperId: string | null
  selectedCrewIds: string[]
  crewSnapshotsById: Record<string, PersonSnapshot>
} {
  const selectedSkipperId =
    typeof entry.selectedSkipperId === 'string' ? entry.selectedSkipperId : null
  const selectedCrewIds = Array.isArray(entry.selectedCrewIds)
    ? entry.selectedCrewIds.filter((id): id is string => typeof id === 'string')
    : []
  const crewSnapshotsById =
    entry.crewSnapshotsById && typeof entry.crewSnapshotsById === 'object'
      ? (entry.crewSnapshotsById as Record<string, PersonSnapshot>)
      : {}
  return { selectedSkipperId, selectedCrewIds, crewSnapshotsById }
}
