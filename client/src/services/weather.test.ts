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
})
