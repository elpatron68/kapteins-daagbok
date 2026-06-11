import {
  getLastLoggedPositionWithin,
  getLatestLoggedPosition,
  LIVE_LOG_TIDE_POSITION_MAX_AGE_MS
} from './liveEventCodes.js'
import type { LogEventPayload } from './logEntryPayload.js'

export type TideLocationSource = 'gps' | 'departure'

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
