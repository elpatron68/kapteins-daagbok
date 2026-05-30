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

/** Chronological order: earliest time first (HH:MM). */
export function sortLogEventsByTime<T extends Pick<LogEventPayload, 'time'>>(events: T[]): T[] {
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
    events: sortLogEventsByTime(input.events.map((e) => ({ ...e })))
  }

  if (input.trackDistanceNm !== undefined) payload.trackDistanceNm = input.trackDistanceNm
  if (input.trackSpeedMaxKn !== undefined) payload.trackSpeedMaxKn = input.trackSpeedMaxKn
  if (input.trackSpeedAvgKn !== undefined) payload.trackSpeedAvgKn = input.trackSpeedAvgKn

  return payload
}
