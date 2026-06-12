import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as bshTides from './bshTides.js'
import * as openMeteoTides from './openMeteoTides.js'
import { fetchTidesForCoordinates } from './tideProvider.js'

describe('fetchTidesForCoordinates', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns BSH data when station is within range', async () => {
    vi.spyOn(bshTides, 'fetchBshTidesForCoordinates').mockResolvedValue({
      distanceKm: 8,
      location: {
        name: 'Norderney, Riffgat',
        lat: 53.696389,
        lon: 7.157778,
        source: 'bsh_station',
        stationId: 'norderney_riffgat'
      },
      tides: {
        data: {
          timezone: 'Europe/Berlin',
          datum: 'gauge',
          source: 'BSH',
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

    const result = await fetchTidesForCoordinates(53.62, 7.15)
    expect(result.distanceKm).toBe(8)
    expect(result.location.source).toBe('bsh_station')
    expect(result.fallback).toBeUndefined()
  })

  it('falls back to Open-Meteo when BSH station is too far', async () => {
    vi.spyOn(bshTides, 'fetchBshTidesForCoordinates').mockRejectedValue(
      Object.assign(new Error('bsh_station_too_far'), { distanceKm: 120 })
    )
    vi.spyOn(openMeteoTides, 'fetchTidesForCoordinates').mockResolvedValue({
      location: { lat: 62, lon: 5, source: 'coordinates' },
      tides: {
        data: {
          timezone: 'Europe/Oslo',
          datum: 'MSL',
          source: 'Open-Meteo Marine',
          extrema: [
            {
              time: '2026-06-12T10:00:00.000Z',
              date: '2026-06-12',
              height: 1.2,
              isHigh: true
            }
          ]
        }
      }
    })

    const result = await fetchTidesForCoordinates(62, 5)
    expect(result.fallback).toBe('open_meteo')
    expect(result.tides.data.source).toContain('Fallback')
  })
})
