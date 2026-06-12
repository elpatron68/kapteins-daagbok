import type { TideExtreme, TideLookupResult } from './openMeteoTides.js'

export const MAX_BSH_DISTANCE_KM = 75
export const BSH_TIMEZONE = 'Europe/Berlin'

const API_BASE =
  'https://gdi.bsh.de/ldproxy/rest/services/WaterLevelForecast/collections/waterlevelforecastdata/items'
const LIST_LIMIT = 1000
const MAX_PAGES = 20
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000

export interface BshStation {
  id: string
  name: string
  lat: number
  lon: number
  area?: string
}

interface OgcFeatureCollection {
  features?: OgcFeature[]
  links?: Array<{ rel?: string; href?: string }>
}

interface OgcFeature {
  type?: string
  id?: string
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}

interface HwnwEvent {
  event?: string
  event_timestamp?: string
  forecast_value?: number | string | null
  tidal_prediction_value?: number | string | null
}

interface CurvePoint {
  timestamp?: string
  automated_curve_forecast?: number | string | null
}

let stationCache: { stations: BshStation[]; loadedAt: number } | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(`BSH HTTP ${res.status}`)
    }
    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

function parseNum(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

function stationFromFeature(feature: OgcFeature): BshStation | null {
  const id = feature.id
  const props = feature.properties
  if (!id || !props) return null

  const name = String(props.gauge_label ?? '').trim()
  if (!name) return null

  const geom = feature.geometry?.coordinates
  const lat = parseNum(props.latitude) ?? (geom ? geom[1] : null)
  const lon = parseNum(props.longitude) ?? (geom ? geom[0] : null)
  if (lat == null || lon == null) return null

  return {
    id,
    name,
    lat,
    lon,
    area: props.area ? String(props.area) : undefined
  }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const p = Math.PI / 180
  const dLat = (lat2 - lat1) * p
  const dLon = (lon2 - lon1) * p
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export interface BshStationSuggestion {
  id: string
  name: string
  lat: number
  lon: number
  distanceKm: number
  area?: string
}

export function findNearestBshStations(
  lat: number,
  lon: number,
  stations: BshStation[],
  limit = 8
): BshStationSuggestion[] {
  const ranked = stations
    .map((station) => ({
      id: station.id,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      area: station.area,
      distanceKm: Number(haversineKm(lat, lon, station.lat, station.lon).toFixed(1))
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)

  return ranked.slice(0, Math.max(1, limit))
}

export function findNearestBshStation(
  lat: number,
  lon: number,
  stations: BshStation[]
): { station: BshStation; distanceKm: number } | null {
  const nearest = findNearestBshStations(lat, lon, stations, 1)[0]
  if (!nearest) return null
  return {
    station: {
      id: nearest.id,
      name: nearest.name,
      lat: nearest.lat,
      lon: nearest.lon,
      area: nearest.area
    },
    distanceKm: nearest.distanceKm
  }
}

export async function loadBshStationIndex(): Promise<BshStation[]> {
  if (stationCache && Date.now() - stationCache.loadedAt < CACHE_TTL_MS) {
    return stationCache.stations
  }

  const stations: BshStation[] = []
  let nextUrl: string | null = `${API_BASE}?f=json&limit=${LIST_LIMIT}`

  for (let page = 0; page < MAX_PAGES && nextUrl; page += 1) {
    const currentUrl = nextUrl
    const payload: OgcFeatureCollection = await fetchJson<OgcFeatureCollection>(currentUrl)
    const features = payload.features ?? []
    for (const feature of features) {
      const station = stationFromFeature(feature)
      if (station) stations.push(station)
    }

    nextUrl = null
    const links = payload.links ?? []
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i]
      if (link.rel === 'next' && link.href) {
        nextUrl = link.href
        break
      }
    }
  }

  if (stations.length === 0) {
    throw new Error('bsh_empty_station_list')
  }

  stationCache = { stations, loadedAt: Date.now() }
  return stations
}

/** Test helper: inject a pre-built station list and skip live index fetch. */
export function setBshStationCacheForTests(stations: BshStation[] | null): void {
  stationCache = stations ? { stations, loadedAt: Date.now() } : null
}

function localDateFromIso(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

function bshTimestampToIso(timestamp: string): string {
  const normalized = timestamp.trim().replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function heightMetresFromCm(value: unknown): number {
  const cm = parseNum(value)
  if (cm == null) return 0
  return Number((cm / 100).toFixed(2))
}

export function parseBshHwnwForecast(
  feature: OgcFeature,
  timeZone = BSH_TIMEZONE
): TideExtreme[] {
  const props = feature.properties ?? {}
  const hwnw = props.high_water_low_water
  if (!Array.isArray(hwnw) || hwnw.length === 0) return []

  const extrema: TideExtreme[] = []
  for (const raw of hwnw as HwnwEvent[]) {
    const event = String(raw.event ?? '').toUpperCase()
    const timestamp = String(raw.event_timestamp ?? '').trim()
    if (!timestamp || (event !== 'HW' && event !== 'NW')) continue

    const iso = bshTimestampToIso(timestamp)
    if (!iso) continue

    const value = raw.forecast_value ?? raw.tidal_prediction_value
    extrema.push({
      time: iso,
      date: localDateFromIso(iso, timeZone),
      height: heightMetresFromCm(value),
      isHigh: event === 'HW'
    })
  }
  return extrema
}

function parseBshCurveForecast(
  feature: OgcFeature,
  timeZone = BSH_TIMEZONE
): TideExtreme[] {
  const curve = feature.properties?.curve
  if (!Array.isArray(curve) || curve.length < 3) return []

  const points = (curve as CurvePoint[])
    .map((p) => ({
      timestamp: String(p.timestamp ?? '').trim(),
      level: parseNum(p.automated_curve_forecast)
    }))
    .filter((p) => p.timestamp && p.level != null) as Array<{
    timestamp: string
    level: number
  }>

  const extrema: TideExtreme[] = []
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1].level
    const curr = points[i].level
    const next = points[i + 1].level
    const isHigh = curr >= prev && curr >= next && (curr > prev || curr > next)
    const isLow = curr <= prev && curr <= next && (curr < prev || curr < next)
    if (!isHigh && !isLow) continue

    const iso = bshTimestampToIso(points[i].timestamp)
    if (!iso) continue
    extrema.push({
      time: iso,
      date: localDateFromIso(iso, timeZone),
      height: Number((curr / 100).toFixed(2)),
      isHigh
    })
  }
  return extrema
}

export function parseBshFeatureToExtrema(feature: OgcFeature): TideExtreme[] {
  const hwnw = parseBshHwnwForecast(feature)
  if (hwnw.length > 0) return hwnw
  return parseBshCurveForecast(feature)
}

async function fetchBshStationFeature(stationId: string): Promise<OgcFeature> {
  const feature = await fetchJson<OgcFeature>(`${API_BASE}/${stationId}?f=json`)
  if (feature.type !== 'Feature' || !feature.properties) {
    throw new Error('bsh_invalid_station')
  }
  return feature
}

export interface BshTideLookupResult extends TideLookupResult {
  distanceKm: number
}

export async function listNearbyBshStations(
  lat: number,
  lon: number,
  limit = 8
): Promise<BshStationSuggestion[]> {
  const stations = await loadBshStationIndex()
  return findNearestBshStations(lat, lon, stations, limit)
}

function buildBshTideResult(
  station: BshStation,
  distanceKm: number,
  feature: OgcFeature
): BshTideLookupResult {
  const extrema = parseBshFeatureToExtrema(feature)
  if (extrema.length === 0) {
    throw new Error('no_tide_data')
  }

  const copyright = feature.properties?.copyright
  let sourceNote = 'BSH Wasserstandsvorhersage (© BSH, CC BY 4.0)'
  if (copyright && typeof copyright === 'object' && copyright !== null) {
    const cr = copyright as Record<string, string>
    sourceNote = cr.de || cr.en || sourceNote
  }

  return {
    distanceKm: Number(distanceKm.toFixed(1)),
    location: {
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      source: 'bsh_station',
      stationId: station.id
    },
    tides: {
      data: {
        timezone: BSH_TIMEZONE,
        datum: 'gauge',
        source: sourceNote,
        extrema
      }
    }
  }
}

export async function fetchBshTidesForStation(
  stationId: string,
  options?: { queryLat?: number; queryLon?: number }
): Promise<BshTideLookupResult> {
  const stations = await loadBshStationIndex()
  const station = stations.find((item) => item.id === stationId)
  if (!station) {
    throw new Error('bsh_invalid_station')
  }

  const feature = await fetchBshStationFeature(stationId)
  const distanceKm =
    options?.queryLat != null && options?.queryLon != null
      ? haversineKm(options.queryLat, options.queryLon, station.lat, station.lon)
      : 0

  return buildBshTideResult(station, distanceKm, feature)
}

export async function fetchBshTidesForCoordinates(
  lat: number,
  lon: number
): Promise<BshTideLookupResult> {
  const stations = await loadBshStationIndex()
  const nearest = findNearestBshStation(lat, lon, stations)
  if (!nearest) {
    throw new Error('no_bsh_station')
  }

  if (nearest.distanceKm > MAX_BSH_DISTANCE_KM) {
    const err = new Error('bsh_station_too_far') as Error & { distanceKm?: number }
    err.distanceKm = nearest.distanceKm
    throw err
  }

  const feature = await fetchBshStationFeature(nearest.station.id)
  return buildBshTideResult(nearest.station, nearest.distanceKm, feature)
}
