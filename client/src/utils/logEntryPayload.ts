import {
  normalizeCourseAngleString,
  normalizeWindDirectionString
} from './courseAngle.js'
import type { EntryCrewFields } from '../types/person.js'

export interface LogEventPayload {
  time: string
  mgk: string
  rwk: string
  windPressure: string
  windDirection: string
  windStrength: string
  seaState: string
  visibility: string
  weatherIcon: string
  current: string
  heel: string
  sailsOrMotor: string
  logReading: string
  distance: string
  gpsLat: string
  gpsLng: string
  remarks: string
  creatorId?: string
}

/** Calendar date YYYY-MM-DD in local timezone (matches logbook entry `date` field). */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Local time as HH:MM (24-hour). */
export function currentLocalTimeHHMM(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** Parse 24h or 12h (AM/PM) time strings to HH:MM. */
export function parseTimeToHHMM(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const amPm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i)
  if (amPm) {
    let hours = parseInt(amPm[1], 10)
    const minutes = parseInt(amPm[2], 10)
    const isPm = amPm[3].toUpperCase() === 'PM'
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null
    if (hours === 12) hours = isPm ? 12 : 0
    else if (isPm) hours += 12
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (h24) {
    const hours = parseInt(h24[1], 10)
    const minutes = parseInt(h24[2], 10)
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }
  }

  return null
}

export function isValidTimeHHMM(value: string): boolean {
  return parseTimeToHHMM(value) !== null
}

export function splitTimeHHMM(value: string, fallback?: string): { hours: string; minutes: string } {
  const parsed = parseTimeToHHMM(value) ?? fallback ?? currentLocalTimeHHMM()
  return { hours: parsed.slice(0, 2), minutes: parsed.slice(3, 5) }
}

export function joinTimeHHMM(hours: string, minutes: string): string {
  const h = Math.min(23, Math.max(0, parseInt(hours, 10) || 0))
  const m = Math.min(59, Math.max(0, parseInt(minutes, 10) || 0))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const LOG_EVENT_FIELDS: (keyof LogEventPayload)[] = [
  'time', 'mgk', 'rwk', 'windPressure', 'windDirection', 'windStrength', 'seaState',
  'visibility', 'weatherIcon', 'current', 'heel', 'sailsOrMotor', 'logReading', 'distance',
  'gpsLat', 'gpsLng', 'remarks', 'creatorId'
]

/** Normalize partial/legacy events so all fields are strings (safe for form + save). */
export function normalizeLogEvent(event: Partial<LogEventPayload> | Record<string, unknown>): LogEventPayload {
  const e = event as Record<string, unknown>
  const timeRaw = String(e.time ?? '').trim()
  const normalized: LogEventPayload = {
    time: parseTimeToHHMM(timeRaw) ?? (timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw),
    mgk: normalizeCourseAngleString(String(e.mgk ?? ''), { allowEmpty: true }),
    rwk: normalizeCourseAngleString(String(e.rwk ?? ''), { allowEmpty: true }),
    windPressure: '',
    windDirection: normalizeWindDirectionString(String(e.windDirection ?? '')),
    windStrength: '',
    seaState: '',
    visibility: '',
    weatherIcon: '',
    current: '',
    heel: '',
    sailsOrMotor: '',
    logReading: '',
    distance: '',
    gpsLat: '',
    gpsLng: '',
    remarks: '',
    creatorId: e.creatorId ? String(e.creatorId).trim() : undefined
  }
  for (const key of LOG_EVENT_FIELDS) {
    if (key === 'time' || key === 'mgk' || key === 'rwk' || key === 'windDirection' || key === 'creatorId') continue
    normalized[key] = String(e[key] ?? '').trim()
  }
  return normalized
}

export function logEventsEqual(a: LogEventPayload, b: LogEventPayload): boolean {
  return LOG_EVENT_FIELDS.every((key) => a[key] === b[key])
}

const LOG_EVENT_CONTENT_FIELDS = LOG_EVENT_FIELDS.filter((key) => key !== 'time' && key !== 'creatorId')

/** Draft with only a time (or empty fields) — not an unsaved log entry change. */
export function isLogEventDraftEmpty(event: LogEventPayload): boolean {
  return LOG_EVENT_CONTENT_FIELDS.every((key) => !event[key]?.trim())
}

/** Whether the event form holds unsaved changes worth merging on page save. */
export function hasUnsavedEventDraft(
  draft: LogEventPayload,
  editingEventIndex: number | null,
  events: LogEventPayload[]
): boolean {
  if (!isValidTimeHHMM(draft.time)) return false
  if (editingEventIndex !== null) {
    const original = events[editingEventIndex]
    return original ? !logEventsEqual(draft, original) : false
  }
  return !isLogEventDraftEmpty(draft)
}

/** Chronological order: earliest time first (HH:MM). */
export function sortLogEventsByTime<T extends LogEventPayload>(events: T[]): T[] {
  return [...events].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
}

export type TideLocationSource = 'gps' | 'departure' | 'geocoded'

export interface LogEntryTides {
  highWater: string
  lowWater: string
  locationSource?: TideLocationSource
  placeName?: string
  lat?: string
  lng?: string
  distanceKm?: string
  tideFallback?: 'open_meteo'
}

export interface LogEntryPayloadInput {
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  freshwater: { morning: number; refilled: number; evening: number; consumption: number }
  fuel: { morning: number; refilled: number; evening: number; consumption: number }
  greywater?: { level: number }
  tides?: LogEntryTides
  trackDistanceNm?: number
  trackSpeedMaxKn?: number
  trackSpeedAvgKn?: number
  motorHours?: number
  events: LogEventPayload[]
  entryCrew?: EntryCrewFields
}

function readTideLocationSource(value: unknown): TideLocationSource | undefined {
  const source = String(value ?? '').trim()
  if (source === 'gps' || source === 'departure' || source === 'geocoded') return source
  return undefined
}

export function readLogEntryTides(data: Record<string, unknown>): LogEntryTides {
  const tides = data.tides as Record<string, unknown> | undefined
  const highRaw = String(tides?.highWater ?? '').trim()
  const lowRaw = String(tides?.lowWater ?? '').trim()
  const placeName = String(tides?.placeName ?? '').trim()
  const lat = String(tides?.lat ?? '').trim()
  const lng = String(tides?.lng ?? '').trim()
  const distanceKm = String(tides?.distanceKm ?? '').trim()
  const locationSource = readTideLocationSource(tides?.locationSource)
  const tideFallback = tides?.tideFallback === 'open_meteo' ? 'open_meteo' as const : undefined

  return {
    highWater: parseTimeToHHMM(highRaw) ?? '',
    lowWater: parseTimeToHHMM(lowRaw) ?? '',
    ...(locationSource ? { locationSource } : {}),
    ...(placeName ? { placeName } : {}),
    ...(lat ? { lat } : {}),
    ...(lng ? { lng } : {}),
    ...(distanceKm ? { distanceKm } : {}),
    ...(tideFallback ? { tideFallback } : {})
  }
}

export function buildLogEntryPayload(input: LogEntryPayloadInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    date: input.date,
    dayOfTravel: input.dayOfTravel.trim(),
    departure: input.departure.trim(),
    destination: input.destination.trim(),
    freshwater: { ...input.freshwater },
    fuel: { ...input.fuel },
    events: sortLogEventsByTime(input.events.map((e) => normalizeLogEvent(e)))
  }

  if (input.trackDistanceNm !== undefined) payload.trackDistanceNm = input.trackDistanceNm
  if (input.trackSpeedMaxKn !== undefined) payload.trackSpeedMaxKn = input.trackSpeedMaxKn
  if (input.trackSpeedAvgKn !== undefined) payload.trackSpeedAvgKn = input.trackSpeedAvgKn
  if (input.motorHours !== undefined && input.motorHours > 0) {
    payload.motorHours = Number(input.motorHours.toFixed(2))
  }

  if (input.greywater !== undefined) {
    const level = Number(input.greywater.level) || 0
    if (level > 0) {
      payload.greywater = { level: Number(level.toFixed(1)) }
    }
  }

  if (input.tides) {
    const highWater = parseTimeToHHMM(input.tides.highWater) ?? ''
    const lowWater = parseTimeToHHMM(input.tides.lowWater) ?? ''
    if (highWater || lowWater) {
      const tides: Record<string, string> = { highWater, lowWater }
      if (input.tides.locationSource) tides.locationSource = input.tides.locationSource
      const placeName = input.tides.placeName?.trim()
      if (placeName) tides.placeName = placeName
      const lat = input.tides.lat?.trim()
      if (lat) tides.lat = lat
      const lng = input.tides.lng?.trim()
      if (lng) tides.lng = lng
      const distanceKm = input.tides.distanceKm?.trim()
      if (distanceKm) tides.distanceKm = distanceKm
      if (input.tides.tideFallback === 'open_meteo') tides.tideFallback = 'open_meteo'
      payload.tides = tides
    }
  }

  if (input.entryCrew) {
    payload.selectedSkipperId = input.entryCrew.selectedSkipperId
    payload.selectedCrewIds = [...input.entryCrew.selectedCrewIds]
    payload.crewSnapshotsById = { ...input.entryCrew.crewSnapshotsById }
  }

  return payload
}
