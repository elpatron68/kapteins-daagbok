import { apiFetch } from './api.js'
import {
  type TideAnalyticsSource,
  PlausibleEvents,
  trackPlausibleEvent
} from './analytics.js'

export class TidesApiError extends Error {
  code: 'OFFLINE' | 'NOT_FOUND' | 'PLACE_NOT_FOUND' | 'BAD_REQUEST' | 'REQUEST_FAILED'

  constructor(
    message: string,
    code: 'OFFLINE' | 'NOT_FOUND' | 'PLACE_NOT_FOUND' | 'BAD_REQUEST' | 'REQUEST_FAILED' = 'REQUEST_FAILED'
  ) {
    super(message)
    this.name = 'TidesApiError'
    this.code = code
  }
}

const TIDES_FETCH_TIMEOUT_MS = 20_000

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
    const code =
      typeof data?.error === 'string' && data.error === 'place_not_found'
        ? 'PLACE_NOT_FOUND'
        : 'NOT_FOUND'
    throw new TidesApiError('Tide data not found', code)
  }
  if (!res.ok) {
    throw new TidesApiError(
      typeof data?.error === 'string' ? data.error : 'Tide API rejected the request'
    )
  }

  return data as Record<string, unknown>
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
