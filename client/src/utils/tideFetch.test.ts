import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as tidesService from '../services/tides.js'
import { fetchTidesForEntry } from './tideFetch.js'

describe('fetchTidesForEntry', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns tide times when nearby fetch succeeds for entry date', async () => {
    vi.spyOn(tidesService, 'fetchTidesNearby').mockResolvedValue({
      distanceKm: 8,
      location: { name: 'Norderney, Riffgat', source: 'bsh_station' },
      tides: {
        data: {
          timezone: 'Europe/Berlin',
          extrema: [
            {
              time: '2026-06-12T07:20:00.000Z',
              date: '2026-06-12',
              height: 6.16,
              isHigh: true
            },
            {
              time: '2026-06-12T13:39:00.000Z',
              date: '2026-06-12',
              height: 4.03,
              isHigh: false
            }
          ]
        }
      }
    })

    const outcome = await fetchTidesForEntry({
      fetchLocation: { mode: 'nearby', lat: '53.624526', lng: '7.155263', source: 'gps' },
      entryDate: '2026-06-12',
      analyticsSource: 'entry_editor'
    })

    expect(outcome).toMatchObject({
      highWater: '09:20',
      lowWater: '15:39'
    })
  })

  it('offers station picker when fetch succeeds but entry date has no extrema', async () => {
    vi.spyOn(tidesService, 'fetchTidesNearby').mockResolvedValue({
      tides: {
        data: {
          timezone: 'Europe/Berlin',
          extrema: [
            {
              time: '2026-06-12T07:20:00.000Z',
              date: '2026-06-12',
              height: 6.16,
              isHigh: true
            }
          ]
        }
      }
    })

    await expect(
      fetchTidesForEntry({
        fetchLocation: { mode: 'nearby', lat: '53.62', lng: '7.15', source: 'gps' },
        entryDate: '2026-06-01',
        analyticsSource: 'entry_editor'
      })
    ).rejects.toMatchObject({ code: 'NO_DATA_FOR_DATE' })
  })

  it('offers station picker when nearby fetch returns not found', async () => {
    vi.spyOn(tidesService, 'fetchTidesNearby').mockRejectedValue(
      new tidesService.TidesApiError('Tide data not found', 'NOT_FOUND', [
        {
          id: 'norderney_riffgat',
          name: 'Norderney, Riffgat',
          lat: 53.69,
          lon: 7.15,
          distanceKm: 8
        }
      ])
    )

    const outcome = await fetchTidesForEntry({
      fetchLocation: { mode: 'nearby', lat: '53.624526', lng: '7.155263', source: 'gps' },
      entryDate: '2026-06-12',
      analyticsSource: 'entry_editor'
    })

    expect(outcome).toEqual({
      kind: 'pick_station',
      entryDate: '2026-06-12',
      fetchLocation: { mode: 'nearby', lat: '53.624526', lng: '7.155263', source: 'gps' },
      stations: [
        {
          id: 'norderney_riffgat',
          name: 'Norderney, Riffgat',
          lat: 53.69,
          lon: 7.15,
          distanceKm: 8
        }
      ],
      lat: '53.624526',
      lng: '7.155263'
    })
  })
})
