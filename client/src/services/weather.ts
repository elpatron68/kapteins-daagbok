import { apiFetch } from './api.js'
import { getOwmApiKey } from './userPreferences.js'

export class WeatherApiError extends Error {
  code: 'NO_KEY' | 'REQUEST_FAILED'

  constructor(message: string, code: 'NO_KEY' | 'REQUEST_FAILED' = 'REQUEST_FAILED') {
    super(message)
    this.name = 'WeatherApiError'
    this.code = code
  }
}

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

  const userKey = getOwmApiKey().trim()
  const headers: Record<string, string> = {}
  if (userKey) headers['X-OWM-Api-Key'] = userKey

  const res = await apiFetch(`/api/weather/current?${searchParams.toString()}`, { headers })

  if (res.status === 503) {
    throw new WeatherApiError('No OpenWeatherMap API key configured', 'NO_KEY')
  }

  const data = await res.json()
  if (!res.ok) {
    throw new WeatherApiError('Weather API rejected the request')
  }

  return data
}
