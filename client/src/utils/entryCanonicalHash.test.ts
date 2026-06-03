import { describe, it, expect } from 'vitest'
import { hashEntryForSigning } from './entryCanonicalHash.js'

describe('hashEntryForSigning', () => {
  it('excludes aiSummary fields from the signing hash', async () => {
    const base = {
      date: '2026-06-03',
      dayOfTravel: '1',
      departure: 'A',
      destination: 'B',
      freshwater: { morning: 0, refilled: 0, evening: 0, consumption: 0 },
      fuel: { morning: 0, refilled: 0, evening: 0, consumption: 0 },
      events: []
    }

    const withoutSummary = await hashEntryForSigning(base)
    const withSummary = await hashEntryForSigning({
      ...base,
      aiSummary: 'A calm day at sea.',
      aiSummaryGeneratedAt: '2026-06-03T12:00:00.000Z'
    })

    expect(withSummary).toBe(withoutSummary)
  })
})
