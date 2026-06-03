import type { TFunction } from 'i18next'
import { apiFetch } from './api.js'
import { formatEventSummary } from '../utils/formatEventSummary.js'
import { sortLogEventsByTime, type LogEventPayload } from '../utils/logEntryPayload.js'
import { PlausibleEvents, trackPlausibleEvent } from './analytics.js'

export class TravelDaySummaryApiError extends Error {
  code: 'NO_KEY' | 'FORBIDDEN' | 'RATE_LIMITED' | 'OFFLINE' | 'REQUEST_FAILED'

  constructor(
    message: string,
    code: 'NO_KEY' | 'FORBIDDEN' | 'RATE_LIMITED' | 'OFFLINE' | 'REQUEST_FAILED' = 'REQUEST_FAILED'
  ) {
    super(message)
    this.name = 'TravelDaySummaryApiError'
    this.code = code
  }
}

export interface TravelDaySummaryContext {
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  trackDistanceNm?: number
  trackSpeedMaxKn?: number
  trackSpeedAvgKn?: number
  motorHours?: number
  freshwater?: {
    morning: number
    refilled: number
    evening: number
    consumption: number
  }
  fuel?: {
    morning: number
    refilled: number
    evening: number
    consumption: number
  }
  greywater?: { level: number }
  events: Array<{
    time: string
    summary: string
    sailsOrMotor?: string
    mgk?: string
    windDirection?: string
    windStrength?: string
    windPressure?: string
    seaState?: string
    visibility?: string
    distance?: string
  }>
}

export interface TravelDaySummaryInput {
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  trackDistanceNm?: number
  trackSpeedMaxKn?: number
  trackSpeedAvgKn?: number
  motorHours?: number
  freshwater: { morning: number; refilled: number; evening: number; consumption: number }
  fuel: { morning: number; refilled: number; evening: number; consumption: number }
  greywaterLevel?: number
  events: LogEventPayload[]
}

const SUMMARY_FETCH_TIMEOUT_MS = 90_000

export function buildTravelDayContext(
  input: TravelDaySummaryInput,
  t: TFunction
): TravelDaySummaryContext {
  const context: TravelDaySummaryContext = {
    date: input.date,
    dayOfTravel: input.dayOfTravel,
    departure: input.departure,
    destination: input.destination,
    freshwater: input.freshwater,
    fuel: input.fuel,
    events: sortLogEventsByTime(input.events).map((event) => ({
      time: event.time,
      summary: formatEventSummary(event, t),
      ...(event.sailsOrMotor ? { sailsOrMotor: event.sailsOrMotor } : {}),
      ...(event.mgk ? { mgk: event.mgk } : {}),
      ...(event.windDirection ? { windDirection: event.windDirection } : {}),
      ...(event.windStrength ? { windStrength: event.windStrength } : {}),
      ...(event.windPressure ? { windPressure: event.windPressure } : {}),
      ...(event.seaState ? { seaState: event.seaState } : {}),
      ...(event.visibility ? { visibility: event.visibility } : {}),
      ...(event.distance ? { distance: event.distance } : {})
    }))
  }

  if (input.trackDistanceNm !== undefined) context.trackDistanceNm = input.trackDistanceNm
  if (input.trackSpeedMaxKn !== undefined) context.trackSpeedMaxKn = input.trackSpeedMaxKn
  if (input.trackSpeedAvgKn !== undefined) context.trackSpeedAvgKn = input.trackSpeedAvgKn
  if (input.motorHours !== undefined && input.motorHours > 0) context.motorHours = input.motorHours
  if (input.greywaterLevel !== undefined && input.greywaterLevel > 0) {
    context.greywater = { level: input.greywaterLevel }
  }

  return context
}

function mapApiError(status: number, data: unknown): TravelDaySummaryApiError {
  const code =
    typeof data === 'object' && data !== null && 'code' in data
      ? String((data as { code?: string }).code)
      : ''

  if (status === 503 || code === 'NO_KEY') {
    return new TravelDaySummaryApiError('No OpenRouter API key configured', 'NO_KEY')
  }
  if (status === 403) {
    return new TravelDaySummaryApiError('Forbidden', 'FORBIDDEN')
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return new TravelDaySummaryApiError('Rate limit exceeded', 'RATE_LIMITED')
  }

  const message =
    typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
      ? (data as { error: string }).error
      : 'Request failed'
  return new TravelDaySummaryApiError(message, 'REQUEST_FAILED')
}

export async function fetchTravelDaySummaryUsage(
  logbookId: string,
  entryId: string
): Promise<{ remainingAttempts: number; maxAttempts: number }> {
  const params = new URLSearchParams({ logbookId, entryId })
  const res = await apiFetch(`/api/ai/usage?${params.toString()}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw mapApiError(res.status, data)
  return data as { remainingAttempts: number; maxAttempts: number }
}

export async function generateTravelDaySummary(params: {
  logbookId: string
  entryId: string
  language: string
  context: TravelDaySummaryContext
}): Promise<{ summary: string; remainingAttempts: number; maxAttempts: number }> {
  if (!navigator.onLine) {
    throw new TravelDaySummaryApiError('Offline', 'OFFLINE')
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), SUMMARY_FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await apiFetch('/api/ai/summary', {
      method: 'POST',
      body: JSON.stringify(params),
      signal: controller.signal
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TravelDaySummaryApiError('AI summary request timed out')
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw mapApiError(res.status, data)

  trackPlausibleEvent(PlausibleEvents.AI_SUMMARY_GENERATED)

  return data as { summary: string; remainingAttempts: number; maxAttempts: number }
}
