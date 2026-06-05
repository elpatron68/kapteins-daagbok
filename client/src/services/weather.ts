import { apiFetch } from './api.js'
import { getOwmApiKeyForActiveUser } from './userPreferences.js'
import {
  type OwmAnalyticsSource,
  PlausibleEvents,
  trackPlausibleEvent
} from './analytics.js'

export class WeatherApiError extends Error {
  code: 'NO_KEY' | 'OFFLINE' | 'REQUEST_FAILED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_REQUEST'

  constructor(
    message: string,
    code: 'NO_KEY' | 'OFFLINE' | 'REQUEST_FAILED' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_REQUEST' = 'REQUEST_FAILED'
  ) {
    super(message)
    this.name = 'WeatherApiError'
    this.code = code
  }
}

const OWM_FETCH_TIMEOUT_MS = 20_000

export async function fetchOpenWeatherCurrent(
  params: {
    lat?: string
    lon?: string
    q?: string
  },
  options?: { analyticsSource: OwmAnalyticsSource }
): Promise<Record<string, unknown>> {
  if (!navigator.onLine) {
    throw new WeatherApiError('Offline', 'OFFLINE')
  }

  const searchParams = new URLSearchParams()

  if (params.lat && params.lon) {
    searchParams.set('lat', params.lat)
    searchParams.set('lon', params.lon)
  } else if (params.q?.trim()) {
    searchParams.set('q', params.q.trim())
  } else {
    throw new WeatherApiError('lat/lon or location query required', 'BAD_REQUEST')
  }

  const userKey = getOwmApiKeyForActiveUser().trim()
  const headers: Record<string, string> = {}
  if (userKey) headers['X-OWM-Api-Key'] = userKey

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), OWM_FETCH_TIMEOUT_MS)
  let res: Response
  try {
    res = await apiFetch(`/api/weather/current?${searchParams.toString()}`, {
      headers,
      signal: controller.signal
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new WeatherApiError('Weather request timed out')
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (res.status === 503) {
    throw new WeatherApiError('No OpenWeatherMap API key configured', 'NO_KEY')
  }
  if (res.status === 401) {
    throw new WeatherApiError('Invalid OpenWeatherMap API key', 'UNAUTHORIZED')
  }
  if (res.status === 404) {
    throw new WeatherApiError('Location or coordinates not found', 'NOT_FOUND')
  }
  if (res.status === 400) {
    throw new WeatherApiError('Invalid or missing location parameters', 'BAD_REQUEST')
  }

  const data = await res.json()
  if (!res.ok) {
    throw new WeatherApiError('Weather API rejected the request')
  }

  if (options?.analyticsSource) {
    trackPlausibleEvent(PlausibleEvents.OWM_WEATHER_FETCHED, {
      source: options.analyticsSource
    })
  }

  return data
}
