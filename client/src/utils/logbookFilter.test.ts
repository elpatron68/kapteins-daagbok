import { describe, expect, it } from 'vitest'
import { logbookMatchesFilter, nameMatchesQuery } from './logbookFilter.js'

describe('nameMatchesQuery', () => {
  it('matches full name', () => {
    expect(nameMatchesQuery('Anna Müller', 'müller')).toBe(true)
  })

  it('matches first name part only', () => {
    expect(nameMatchesQuery('Anna Müller', 'anna')).toBe(true)
  })

  it('matches last name part only', () => {
    expect(nameMatchesQuery('Anna Müller', 'mül')).toBe(true)
  })

  it('returns false for unrelated query', () => {
    expect(nameMatchesQuery('Anna Müller', 'peter')).toBe(false)
  })
})

describe('logbookMatchesFilter', () => {
  const lb = { title: 'Sommer 2024', updatedAt: '2024-06-15T12:00:00.000Z' }

  it('matches logbook title', () => {
    expect(logbookMatchesFilter(lb, 'sommer', 'de')).toBe(true)
  })

  it('matches vessel name from search fields', () => {
    expect(
      logbookMatchesFilter(lb, 'wind', 'de', { vesselName: 'Windrose', crewNames: [] })
    ).toBe(true)
  })

  it('matches crew first name from search fields', () => {
    expect(
      logbookMatchesFilter(lb, 'klaus', 'de', {
        vesselName: '',
        crewNames: ['Klaus Hansen']
      })
    ).toBe(true)
  })

  it('matches crew last name from search fields', () => {
    expect(
      logbookMatchesFilter(lb, 'hansen', 'de', {
        vesselName: '',
        crewNames: ['Klaus Hansen']
      })
    ).toBe(true)
  })
})
