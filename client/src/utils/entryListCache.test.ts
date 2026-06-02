import { describe, expect, it } from 'vitest'
import { buildEntryListCache, entryListItemFromLocal } from './entryListCache.js'
import type { LocalEntry } from '../services/db.js'

describe('entryListCache', () => {
  it('builds cache fields from decrypted entry', async () => {
    const cache = await buildEntryListCache({
      date: '2026-06-02',
      dayOfTravel: '3',
      departure: 'Kiel',
      destination: 'Laboe',
      signSkipper: 'Max'
    })
    expect(cache).toEqual({
      date: '2026-06-02',
      dayOfTravel: '3',
      departure: 'Kiel',
      destination: 'Laboe',
      skipperSignStatus: 'valid'
    })
  })

  it('maps cached local entry to list item', () => {
    const entry: LocalEntry = {
      payloadId: 'e1',
      logbookId: 'lb1',
      encryptedData: 'x',
      iv: 'i',
      tag: 't',
      updatedAt: '2026-06-02T12:00:00.000Z',
      listCache: {
        date: '2026-06-02',
        dayOfTravel: '1',
        departure: 'A',
        destination: 'B',
        skipperSignStatus: 'none'
      }
    }
    expect(entryListItemFromLocal(entry)).toEqual({
      id: 'e1',
      date: '2026-06-02',
      dayOfTravel: '1',
      departure: 'A',
      destination: 'B',
      updatedAt: '2026-06-02T12:00:00.000Z',
      skipperSignStatus: 'none'
    })
  })

  it('returns null when cache is missing', () => {
    const entry: LocalEntry = {
      payloadId: 'e1',
      logbookId: 'lb1',
      encryptedData: 'x',
      iv: 'i',
      tag: 't',
      updatedAt: '2026-06-02T12:00:00.000Z'
    }
    expect(entryListItemFromLocal(entry)).toBeNull()
  })
})
