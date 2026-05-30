export interface LogEventPayload {
  time: string
  mgk: string
  rwk: string
  windPressure: string
  windDirection: string
  windStrength: string
  seaState: string
  weatherIcon: string
  current: string
  heel: string
  sailsOrMotor: string
  logReading: string
  distance: string
  gpsLat: string
  gpsLng: string
  remarks: string
}

const LOG_EVENT_FIELDS: (keyof LogEventPayload)[] = [
  'time', 'mgk', 'rwk', 'windPressure', 'windDirection', 'windStrength', 'seaState',
  'weatherIcon', 'current', 'heel', 'sailsOrMotor', 'logReading', 'distance',
  'gpsLat', 'gpsLng', 'remarks'
]

/** Normalize partial/legacy events so all fields are strings (safe for form + save). */
export function normalizeLogEvent(event: Partial<LogEventPayload> | Record<string, unknown>): LogEventPayload {
  const e = event as Record<string, unknown>
  const timeRaw = String(e.time ?? '').trim()
  const normalized: LogEventPayload = {
    time: timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw,
    mgk: '',
    rwk: '',
    windPressure: '',
    windDirection: '',
    windStrength: '',
    seaState: '',
    weatherIcon: '',
    current: '',
    heel: '',
    sailsOrMotor: '',
    logReading: '',
    distance: '',
    gpsLat: '',
    gpsLng: '',
    remarks: ''
  }
  for (const key of LOG_EVENT_FIELDS) {
    if (key === 'time') continue
    normalized[key] = String(e[key] ?? '').trim()
  }
  return normalized
}

export function logEventsEqual(a: LogEventPayload, b: LogEventPayload): boolean {
  return LOG_EVENT_FIELDS.every((key) => a[key] === b[key])
}

/** Chronological order: earliest time first (HH:MM). */
export function sortLogEventsByTime<T extends LogEventPayload>(events: T[]): T[] {
  return [...events].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
}

export interface LogEntryPayloadInput {
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  freshwater: { morning: number; refilled: number; evening: number; consumption: number }
  fuel: { morning: number; refilled: number; evening: number; consumption: number }
  trackDistanceNm?: number
  trackSpeedMaxKn?: number
  trackSpeedAvgKn?: number
  motorHours?: number
  events: LogEventPayload[]
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

  return payload
}
