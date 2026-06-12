import { describe, expect, it } from 'vitest'
import { LIVE_EVENT_CODES } from './liveEventCodes.js'
import {
  buildTideLocationMeta,
  formatTideLocationLabel,
  resolveTideFetchLocation,
  getAvailableTideLocations
} from './tideLocation.js'

const entryDate = '2026-06-11'
const nowMs = new Date('2026-06-11T12:00:00').getTime()

describe('resolveTideFetchLocation', () => {
  it('uses chronologically latest position when several are logged', () => {
    const result = resolveTideFetchLocation({
      events: [
        {
          time: '14:03',
          remarks: LIVE_EVENT_CODES.POSITION,
          gpsLat: '53.624526',
          gpsLng: '7.155263'
        },
        {
          time: '14:16',
          remarks: LIVE_EVENT_CODES.POSITION,
          gpsLat: '54.120000',
          gpsLng: '10.650000'
        }
      ],
      entryDate,
      departure: 'Norddeich',
      nowMs
    })
    expect(result).toEqual({
      mode: 'nearby',
      lat: '54.120000',
      lng: '10.650000',
      source: 'gps'
    })
  })

  it('prefers fresh GPS position', () => {
    const result = resolveTideFetchLocation({
      events: [
        {
          time: '11:30',
          remarks: LIVE_EVENT_CODES.POSITION,
          gpsLat: '54.32',
          gpsLng: '10.14'
        }
      ],
      entryDate,
      departure: 'Kiel',
      nowMs
    })
    expect(result).toEqual({
      mode: 'nearby',
      lat: '54.32',
      lng: '10.14',
      source: 'gps'
    })
  })

  it('falls back to departure when no position', () => {
    const result = resolveTideFetchLocation({
      events: [],
      entryDate,
      departure: 'Sylt',
      nowMs
    })
    expect(result).toEqual({
      mode: 'by-place',
      query: 'Sylt',
      source: 'departure'
    })
  })

  it('falls back to departure when position is stale', () => {
    const result = resolveTideFetchLocation({
      events: [
        {
          time: '08:00',
          remarks: LIVE_EVENT_CODES.POSITION,
          gpsLat: '54.32',
          gpsLng: '10.14'
        }
      ],
      entryDate,
      departure: 'Kiel',
      nowMs
    })
    expect(result).toEqual({
      mode: 'by-place',
      query: 'Kiel',
      source: 'departure'
    })
  })

  it('returns stale without departure', () => {
    const result = resolveTideFetchLocation({
      events: [
        {
          time: '08:00',
          remarks: LIVE_EVENT_CODES.POSITION,
          gpsLat: '54.32',
          gpsLng: '10.14'
        }
      ],
      entryDate,
      departure: '',
      nowMs
    })
    expect(result).toEqual({ error: 'stale' })
  })

  it('builds GPS location metadata from nearby fetch', () => {
    const meta = buildTideLocationMeta(
      { mode: 'nearby', lat: '53.624526', lng: '7.155263', source: 'gps' },
      { location: { name: 'Norddeich', lat: 53.62, lon: 7.15, source: 'coordinates' } }
    )
    expect(meta).toEqual({
      locationSource: 'gps',
      lat: '53.624526',
      lng: '7.155263',
      placeName: 'Norddeich'
    })
  })

  it('formats coordinate and place labels', () => {
    const t = (key: string, options?: Record<string, string | undefined>) =>
      `${key}:${JSON.stringify(options ?? {})}`
    expect(
      formatTideLocationLabel(
        {
          locationSource: 'gps',
          lat: '53.62',
          lng: '7.15',
          placeName: 'Norderney, Riffgat',
          distanceKm: '8'
        },
        t
      )
    ).toContain('tide_fetched_from')
    expect(
      formatTideLocationLabel({ locationSource: 'gps', lat: '53.62', lng: '7.15' }, t)
    ).toContain('tide_data_for_position')
    expect(
      formatTideLocationLabel({ locationSource: 'gps', tideFallback: 'open_meteo' }, t)
    ).toContain('tide_open_meteo_fallback')
  })

  it('stores distance from BSH API metadata', () => {
    const meta = buildTideLocationMeta(
      { mode: 'nearby', lat: '53.624526', lng: '7.155263', source: 'gps' },
      {
        distanceKm: 8.1,
        location: {
          name: 'Norderney, Riffgat',
          lat: 53.696389,
          lon: 7.157778,
          source: 'bsh_station'
        }
      }
    )
    expect(meta.distanceKm).toBe('8.1')
    expect(meta.placeName).toBe('Norderney, Riffgat')
  })

  it('returns missing without position or departure', () => {
    const result = resolveTideFetchLocation({
      events: [],
      entryDate,
      departure: '',
      nowMs
    })
    expect(result).toEqual({ error: 'missing' })
  })
})

describe('getAvailableTideLocations', () => {
  it('returns empty list when no locations are available', () => {
    const list = getAvailableTideLocations({
      departure: '',
      destination: '',
      events: [],
      entryDate
    })
    expect(list).toEqual([])
  })

  it('returns departure and destination when they are non-empty', () => {
    const list = getAvailableTideLocations({
      departure: 'Büsum',
      destination: 'Helgoland',
      events: [],
      entryDate
    })
    expect(list).toHaveLength(2)
    expect(list[0]).toEqual({
      role: 'departure',
      labelKey: 'logs.tide_role_departure',
      displayLabel: 'Büsum',
      fetchLocation: { mode: 'by-place', query: 'Büsum', source: 'departure' }
    })
    expect(list[1]).toEqual({
      role: 'destination',
      labelKey: 'logs.tide_role_destination',
      displayLabel: 'Helgoland',
      fetchLocation: { mode: 'by-place', query: 'Helgoland', source: 'destination' }
    })
  })

  it('returns gps when fresh position is present in events', () => {
    const list = getAvailableTideLocations({
      departure: 'Büsum',
      destination: '',
      events: [
        {
          time: '11:30',
          remarks: LIVE_EVENT_CODES.POSITION,
          gpsLat: '54.1',
          gpsLng: '8.8'
        }
      ],
      entryDate,
      nowMs
    })
    expect(list).toHaveLength(2)
    expect(list[0].role).toBe('departure')
    expect(list[1]).toEqual({
      role: 'gps',
      labelKey: 'logs.tide_role_gps',
      displayLabel: '54.1, 8.8',
      fetchLocation: { mode: 'nearby', lat: '54.1', lng: '8.8', source: 'gps' }
    })
  })
})
