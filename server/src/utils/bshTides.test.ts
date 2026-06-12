import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  findNearestBshStation,
  findNearestBshStations,
  haversineKm,
  parseBshFeatureToExtrema,
  parseBshHwnwForecast,
  setBshStationCacheForTests,
  type BshStation
} from './bshTides.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as T
}

const stationIndex = loadJson<BshStation[]>('bsh-station-index.json')

describe('haversineKm', () => {
  it('returns zero for identical points', () => {
    expect(haversineKm(53.62, 7.15, 53.62, 7.15)).toBe(0)
  })
})

describe('findNearestBshStations', () => {
  it('returns multiple ranked stations', () => {
    const nearest = findNearestBshStations(53.624526, 7.155263, stationIndex, 3)
    expect(nearest).toHaveLength(3)
    expect(nearest[0].id).toBe('norderney_riffgat')
    expect(nearest[1].distanceKm).toBeGreaterThanOrEqual(nearest[0].distanceKm)
  })
})

describe('findNearestBshStation', () => {
  it('picks Norderney Riffgat for Norddeich coordinates', () => {
    const nearest = findNearestBshStation(53.624526, 7.155263, stationIndex)
    expect(nearest?.station.id).toBe('norderney_riffgat')
    expect(nearest?.distanceKm).toBeGreaterThan(5)
    expect(nearest?.distanceKm).toBeLessThan(12)
  })

  it('picks Kiel-Holtenau for Kiel coordinates', () => {
    const nearest = findNearestBshStation(54.32, 10.14, stationIndex)
    expect(nearest?.station.id).toBe('kiel-holtenau')
    expect(nearest?.distanceKm).toBeLessThan(10)
  })
})

describe('parseBshHwnwForecast', () => {
  it('maps HW/NW events to extrema with Europe/Berlin dates', () => {
    const feature = loadJson<{ properties: Record<string, unknown> }>('bsh-norderney_riffgat.json')
    const extrema = parseBshHwnwForecast(feature)

    expect(extrema.length).toBeGreaterThan(0)
    const high = extrema.find((e) => e.isHigh)
    const low = extrema.find((e) => !e.isHigh)
    expect(high?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(low?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(high?.time).toContain('T')
    expect(high?.height).toBeGreaterThan(0)
  })
})

describe('parseBshFeatureToExtrema', () => {
  it('uses hwnw_forecast when available', () => {
    const feature = loadJson('bsh-norderney_riffgat.json')
    const extrema = parseBshFeatureToExtrema(feature)
    expect(extrema.some((e) => e.isHigh)).toBe(true)
    expect(extrema.some((e) => !e.isHigh)).toBe(true)
  })
})

describe('setBshStationCacheForTests', () => {
  it('allows injecting station cache', () => {
    setBshStationCacheForTests(stationIndex)
    expect(findNearestBshStation(53.624526, 7.155263, stationIndex)?.station.id).toBe(
      'norderney_riffgat'
    )
    setBshStationCacheForTests(null)
  })
})
