import { describe, expect, it } from 'vitest'
import type { PersonData } from '../types/person.js'
import {
  legacyCrewRecordsToLogbookSelection,
  pickActiveSkipperId
} from './personSnapshots.js'

function person(overrides: Partial<PersonData> & { role: PersonData['role'] }): PersonData {
  return {
    name: overrides.name ?? 'Test',
    address: '',
    birthDate: '',
    phone: '',
    nationality: '',
    passportNumber: '',
    bloodType: '',
    allergies: '',
    diseases: '',
    role: overrides.role
  }
}

describe('pickActiveSkipperId', () => {
  it('returns null for empty list', () => {
    expect(pickActiveSkipperId([])).toBeNull()
  })

  it('prefers canonical skipper payload id', () => {
    expect(pickActiveSkipperId(['other-skipper', 'skipper', 'third'])).toBe('skipper')
  })

  it('keeps first skipper when canonical id is absent', () => {
    expect(pickActiveSkipperId(['alpha', 'beta'])).toBe('alpha')
  })
})

describe('legacyCrewRecordsToLogbookSelection', () => {
  it('does not let a later skipper overwrite the active skipper', () => {
    const selection = legacyCrewRecordsToLogbookSelection([
      { payloadId: 'skipper', data: person({ role: 'skipper', name: 'Primary' }) },
      { payloadId: 'co-skipper', data: person({ role: 'skipper', name: 'Secondary' }) },
      { payloadId: 'crew-1', data: person({ role: 'crew', name: 'Crew' }) }
    ])

    expect(selection.activeSkipperId).toBe('skipper')
    expect(selection.activeCrewIds).toEqual(['crew-1'])
    expect(Object.keys(selection.snapshotsById)).toEqual(['skipper', 'co-skipper', 'crew-1'])
  })

  it('uses first skipper when canonical id is missing', () => {
    const selection = legacyCrewRecordsToLogbookSelection([
      { payloadId: 'first-skip', data: person({ role: 'skipper', name: 'First' }) },
      { payloadId: 'second-skip', data: person({ role: 'skipper', name: 'Second' }) }
    ])

    expect(selection.activeSkipperId).toBe('first-skip')
  })
})
