export class WeatherApiError extends Error {
  code: 'NO_KEY' | 'REQUEST_FAILED'

  constructor(message: string, code: 'NO_KEY' | 'REQUEST_FAILED' = 'REQUEST_FAILED') {
    super(message)
    this.name = 'WeatherApiError'
    this.code = code
  }
}

function buildWeatherHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const userId = localStorage.getItem('active_userid')
  const userKey = localStorage.getItem('owm_api_key')?.trim()

  if (userId) headers['X-User-Id'] = userId
  if (userKey) headers['X-OWM-Api-Key'] = userKey

  return headers
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

  const res = await fetch(`/api/weather/current?${searchParams.toString()}`, {
    headers: buildWeatherHeaders()
  })

  if (res.status === 503) {
    throw new WeatherApiError('No OpenWeatherMap API key configured', 'NO_KEY')
  }

  const data = await res.json()
  if (!res.ok) {
    throw new WeatherApiError('Weather API rejected the request')
  }

  return data
}
