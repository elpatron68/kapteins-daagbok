import { apiFetch } from './api.js'
import {
  type TideAnalyticsSource,
  PlausibleEvents,
  trackPlausibleEvent
} from './analytics.js'

export interface TideStation {
  id: string
  name: string
  lat: number
  lon: number
  distanceKm: number
  area?: string
}

export class TidesApiError extends Error {
  code:
    | 'OFFLINE'
    | 'NOT_FOUND'
    | 'NO_DATA_FOR_DATE'
    | 'PLACE_NOT_FOUND'
    | 'BAD_REQUEST'
    | 'REQUEST_FAILED'
  stations?: TideStation[]

  constructor(
    message: string,
    code:
      | 'OFFLINE'
      | 'NOT_FOUND'
      | 'NO_DATA_FOR_DATE'
      | 'PLACE_NOT_FOUND'
      | 'BAD_REQUEST'
      | 'REQUEST_FAILED' = 'REQUEST_FAILED',
    stations?: TideStation[]
  ) {
    super(message)
    this.name = 'TidesApiError'
    this.code = code
    this.stations = stations
  }
}

const TIDES_FETCH_TIMEOUT_MS = 20_000

function readStations(data: Record<string, unknown>): TideStation[] | undefined {
  if (!Array.isArray(data.stations)) return undefined
  const stations: TideStation[] = []
  for (const item of data.stations) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? '').trim()
    const name = String(row.name ?? '').trim()
    const lat = Number(row.lat)
    const lon = Number(row.lon)
    const distanceKm = Number(row.distanceKm)
    if (!id || !name || Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(distanceKm)) {
      continue
    }
    stations.push({
      id,
      name,
      lat,
      lon,
      distanceKm,
      area: row.area ? String(row.area) : undefined
    })
  }
  return stations.length > 0 ? stations : undefined
}

async function fetchTides(path: string): Promise<Record<string, unknown>> {
  if (!navigator.onLine) {
    throw new TidesApiError('Offline', 'OFFLINE')
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), TIDES_FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await apiFetch(path, { signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TidesApiError('Tide request timed out')
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }

  const data = await res.json().catch(() => ({}))
  if (res.status === 400) {
    throw new TidesApiError('Invalid tide request parameters', 'BAD_REQUEST')
  }
  if (res.status === 404) {
    const stations = readStations(data as Record<string, unknown>)
    const code =
      typeof data?.error === 'string' && data.error === 'place_not_found'
        ? 'PLACE_NOT_FOUND'
        : 'NOT_FOUND'
    throw new TidesApiError('Tide data not found', code, stations)
  }
  if (!res.ok) {
    throw new TidesApiError(
      typeof data?.error === 'string' ? data.error : 'Tide API rejected the request'
    )
  }

  return data as Record<string, unknown>
}

export async function fetchNearbyTideStations(
  lat: string,
  lon: string,
  limit = 8
): Promise<TideStation[]> {
  const searchParams = new URLSearchParams({ lat, lon, limit: String(limit) })
  const data = await fetchTides(`/api/tides/stations/nearby?${searchParams.toString()}`)
  return readStations(data) ?? []
}

export async function fetchTidesNearby(
  lat: string,
  lon: string,
  options?: { analyticsSource?: TideAnalyticsSource; locationSource?: 'gps' | 'departure' }
): Promise<Record<string, unknown>> {
  const searchParams = new URLSearchParams({ lat, lon })
  const data = await fetchTides(`/api/tides/nearby?${searchParams.toString()}`)
  if (options?.analyticsSource) {
    trackPlausibleEvent(PlausibleEvents.TIDE_FETCHED, {
      source: options.analyticsSource,
      location_source: options.locationSource ?? 'gps'
    })
  }
  return data
}

export async function fetchTidesByStation(
  stationId: string,
  options?: {
    queryLat?: string
    queryLng?: string
    analyticsSource?: TideAnalyticsSource
  }
): Promise<Record<string, unknown>> {
  const searchParams = new URLSearchParams()
  if (options?.queryLat) searchParams.set('lat', options.queryLat)
  if (options?.queryLng) searchParams.set('lon', options.queryLng)
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
  const data = await fetchTides(`/api/tides/station/${encodeURIComponent(stationId)}${suffix}`)
  if (options?.analyticsSource) {
    trackPlausibleEvent(PlausibleEvents.TIDE_FETCHED, {
      source: options.analyticsSource,
      location_source: 'gps'
    })
  }
  return data
}

export async function fetchTidesByPlace(
  placeQuery: string,
  options?: { analyticsSource?: TideAnalyticsSource }
): Promise<Record<string, unknown>> {
  const searchParams = new URLSearchParams({ q: placeQuery.trim() })
  const data = await fetchTides(`/api/tides/by-place?${searchParams.toString()}`)
  if (options?.analyticsSource) {
    trackPlausibleEvent(PlausibleEvents.TIDE_FETCHED, {
      source: options.analyticsSource,
      location_source: 'departure'
    })
  }
  return data
}
