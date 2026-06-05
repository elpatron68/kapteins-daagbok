import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlausibleEvents } from './analytics.js'

const apiFetch = vi.fn()
const trackPlausibleEvent = vi.fn()

vi.mock('./api.js', () => ({ apiFetch }))
vi.mock('./analytics.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./analytics.js')>()
  return {
    ...actual,
    trackPlausibleEvent: (...args: unknown[]) => trackPlausibleEvent(...args)
  }
})
vi.mock('./userPreferences.js', () => ({
  getOwmApiKeyForActiveUser: () => ''
}))

describe('fetchOpenWeatherCurrent', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    trackPlausibleEvent.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tracks OWM Weather Fetched on success when analyticsSource is set', async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ coord: { lat: 54, lon: 10 }, main: { temp: 20 } })
    })

    const { fetchOpenWeatherCurrent } = await import('./weather.js')
    await fetchOpenWeatherCurrent(
      { lat: '54.0', lon: '10.0' },
      { analyticsSource: 'live_log' }
    )

    expect(trackPlausibleEvent).toHaveBeenCalledWith(PlausibleEvents.OWM_WEATHER_FETCHED, {
      source: 'live_log'
    })
  })

  it('throws OFFLINE when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })

    const { fetchOpenWeatherCurrent, WeatherApiError } = await import('./weather.js')
    const err = await fetchOpenWeatherCurrent({ lat: '54', lon: '10' }).catch((e) => e)
    expect(err).toBeInstanceOf(WeatherApiError)
    expect((err as InstanceType<typeof WeatherApiError>).code).toBe('OFFLINE')

    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('does not track when the API request fails', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'fail' })
    })

    const { fetchOpenWeatherCurrent, WeatherApiError } = await import('./weather.js')
    await expect(
      fetchOpenWeatherCurrent({ lat: '54', lon: '10' }, { analyticsSource: 'entry_editor' })
    ).rejects.toBeInstanceOf(WeatherApiError)

    expect(trackPlausibleEvent).not.toHaveBeenCalled()
  })

  it('throws UNAUTHORIZED when status is 401', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' })
    })

    const { fetchOpenWeatherCurrent, WeatherApiError } = await import('./weather.js')
    const err = await fetchOpenWeatherCurrent({ lat: '54', lon: '10' }).catch((e) => e)
    expect(err).toBeInstanceOf(WeatherApiError)
    expect((err as any).code).toBe('UNAUTHORIZED')
  })

  it('throws NOT_FOUND when status is 404', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not Found' })
    })

    const { fetchOpenWeatherCurrent, WeatherApiError } = await import('./weather.js')
    const err = await fetchOpenWeatherCurrent({ lat: '54', lon: '10' }).catch((e) => e)
    expect(err).toBeInstanceOf(WeatherApiError)
    expect((err as any).code).toBe('NOT_FOUND')
  })

  it('throws BAD_REQUEST when status is 400', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request' })
    })

    const { fetchOpenWeatherCurrent, WeatherApiError } = await import('./weather.js')
    const err = await fetchOpenWeatherCurrent({ lat: '54', lon: '10' }).catch((e) => e)
    expect(err).toBeInstanceOf(WeatherApiError)
    expect((err as any).code).toBe('BAD_REQUEST')
  })

  it('throws BAD_REQUEST when coordinates or query are missing', async () => {
    const { fetchOpenWeatherCurrent, WeatherApiError } = await import('./weather.js')
    const err = await fetchOpenWeatherCurrent({}).catch((e) => e)
    expect(err).toBeInstanceOf(WeatherApiError)
    expect((err as any).code).toBe('BAD_REQUEST')
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
