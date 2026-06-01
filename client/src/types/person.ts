export type PersonRole = 'skipper' | 'crew'

export interface PersonData {
  name: string
  address: string
  birthDate: string
  phone: string
  nationality: string
  passportNumber: string
  bloodType: string
  allergies: string
  diseases: string
  role: PersonRole
  photo?: string | null
}

export interface PersonSnapshot {
  id: string
  role: PersonRole
  name: string
  address: string
  birthDate: string
  phone: string
  nationality: string
  passportNumber: string
  bloodType: string
  allergies: string
  diseases: string
  photo?: string | null
}

export interface LogbookCrewSelectionData {
  activeSkipperId: string | null
  activeCrewIds: string[]
  /** Denormalized for collaborators / offline display without account pool access */
  snapshotsById: Record<string, PersonSnapshot>
}

export interface EntryCrewFields {
  selectedSkipperId: string | null
  selectedCrewIds: string[]
  crewSnapshotsById: Record<string, PersonSnapshot>
}

export const MAX_POOL_CREW_MEMBERS = 5

export function emptyLogbookCrewSelection(): LogbookCrewSelectionData {
  return {
    activeSkipperId: null,
    activeCrewIds: [],
    snapshotsById: {}
  }
}

export function emptyEntryCrewFields(): EntryCrewFields {
  return {
    selectedSkipperId: null,
    selectedCrewIds: [],
    crewSnapshotsById: {}
  }
}
