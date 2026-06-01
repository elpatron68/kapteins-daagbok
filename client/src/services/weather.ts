import { apiFetch } from './api.js'
import { getOwmApiKeyForActiveUser } from './userPreferences.js'

export class WeatherApiError extends Error {
  code: 'NO_KEY' | 'REQUEST_FAILED'

  constructor(message: string, code: 'NO_KEY' | 'REQUEST_FAILED' = 'REQUEST_FAILED') {
    super(message)
    this.name = 'WeatherApiError'
    this.code = code
  }
}

const OWM_FETCH_TIMEOUT_MS = 20_000

export async function fetchOpenWeatherCurrent(params: {
  lat?: string
  lon?: string
  q?: string
}): Promise<Record<string, unknown>> {
  const searchParams = new URLSearchParams()

  if (params.lat && params.lon) {
    searchParams.set('lat', params.lat)
    searchParams.set('lon', params.lon)
  } else if (params.q?.trim()) {
    searchParams.set('q', params.q.trim())
  } else {
    throw new WeatherApiError('lat/lon or location query required')
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

  const data = await res.json()
  if (!res.ok) {
    throw new WeatherApiError('Weather API rejected the request')
  }

  return data
}
