import {
  getLastLoggedPositionWithin,
  getLatestLoggedPosition,
  LIVE_LOG_TIDE_POSITION_MAX_AGE_MS
} from './liveEventCodes.js'
import type { LogEntryTides, LogEventPayload, TideLocationSource } from './logEntryPayload.js'

export type { TideLocationSource }

export type TideLocationMeta = Pick<LogEntryTides, 'locationSource' | 'placeName' | 'lat' | 'lng'>

export type TideFetchLocation =
  | { mode: 'nearby'; lat: string; lng: string; source: 'gps' }
  | { mode: 'by-place'; query: string; source: 'departure' }

export type TideLocationError = 'stale' | 'missing'

export function resolveTideFetchLocation(options: {
  events: Array<Pick<LogEventPayload, 'remarks' | 'time' | 'gpsLat' | 'gpsLng'>>
  entryDate: string
  departure: string
  maxAgeMs?: number
  nowMs?: number
}): TideFetchLocation | { error: TideLocationError } {
  const maxAgeMs = options.maxAgeMs ?? LIVE_LOG_TIDE_POSITION_MAX_AGE_MS
  const nowMs = options.nowMs ?? Date.now()
  const departure = options.departure.trim()

  const fresh = getLastLoggedPositionWithin(
    options.events,
    options.entryDate,
    maxAgeMs,
    nowMs
  )
  if (fresh) {
    return { mode: 'nearby', lat: fresh.lat, lng: fresh.lng, source: 'gps' }
  }

  if (departure) {
    return { mode: 'by-place', query: departure, source: 'departure' }
  }

  const latest = getLatestLoggedPosition(options.events, options.entryDate)
  if (latest && nowMs - latest.loggedAtMs > maxAgeMs) {
    return { error: 'stale' }
  }

  return { error: 'missing' }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function buildTideLocationMeta(
  fetchLocation: TideFetchLocation,
  apiData: Record<string, unknown>
): TideLocationMeta {
  const apiLocation = asRecord(apiData.location)

  if (fetchLocation.mode === 'nearby') {
    return {
      locationSource: 'gps',
      lat: fetchLocation.lat,
      lng: fetchLocation.lng,
      placeName: apiLocation?.name ? String(apiLocation.name) : undefined
    }
  }

  const placeName = apiLocation?.name ? String(apiLocation.name) : fetchLocation.query
  const lat = apiLocation?.lat != null && apiLocation.lat !== '' ? String(apiLocation.lat) : undefined
  const lng = apiLocation?.lon != null && apiLocation.lon !== '' ? String(apiLocation.lon) : undefined

  return {
    locationSource: apiLocation?.source === 'geocoded' ? 'geocoded' : 'departure',
    placeName,
    lat,
    lng
  }
}

type TideLocationLabelT = (
  key: string,
  options?: Record<string, string | undefined>
) => string

export function formatTideLocationLabel(
  tides: TideLocationMeta,
  t: TideLocationLabelT
): string {
  const placeName = tides.placeName?.trim()
  const lat = tides.lat?.trim()
  const lng = tides.lng?.trim()

  if (placeName && lat && lng) {
    return t('logs.tide_data_for_place_and_position', { place: placeName, lat, lng })
  }
  if (lat && lng) {
    return t('logs.tide_data_for_position', { lat, lng })
  }
  if (placeName) {
    if (tides.locationSource === 'departure') {
      return t('logs.tide_fetched_from_departure', { place: placeName })
    }
    return t('logs.tide_data_for_place', { place: placeName })
  }
  return ''
}

export function pickTideLocationMeta(tides: LogEntryTides): TideLocationMeta {
  return {
    locationSource: tides.locationSource,
    placeName: tides.placeName,
    lat: tides.lat,
    lng: tides.lng
  }
}
