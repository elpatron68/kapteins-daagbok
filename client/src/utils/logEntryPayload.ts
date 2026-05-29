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
    events: input.events.map((e) => ({ ...e }))
  }

  if (input.trackDistanceNm !== undefined) payload.trackDistanceNm = input.trackDistanceNm
  if (input.trackSpeedMaxKn !== undefined) payload.trackSpeedMaxKn = input.trackSpeedMaxKn
  if (input.trackSpeedAvgKn !== undefined) payload.trackSpeedAvgKn = input.trackSpeedAvgKn

  return payload
}
