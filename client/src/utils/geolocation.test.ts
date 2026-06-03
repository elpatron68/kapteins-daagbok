import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyGpsAccuracyMeters,
  formatGpsAccuracyMeters,
  geolocationErrorI18nKey,
  GEOLOCATION_LIVE_INTRO_STORAGE_KEY,
  getCurrentPosition,
  getGeolocationErrorReason,
  hasSeenGeolocationLiveIntro,
  markGeolocationLiveIntroSeen,
  normalizeGpsCoordinates,
  parseGpsCoordinate,
  queryGeolocationPermission
} from './geolocation.js'

describe('geolocation helpers', () => {
  beforeEach(() => {
    localStorage.removeItem(GEOLOCATION_LIVE_INTRO_STORAGE_KEY)
  })

  it('tracks Live-Log geolocation intro in localStorage', () => {
    expect(hasSeenGeolocationLiveIntro()).toBe(false)
    markGeolocationLiveIntroSeen()
    expect(hasSeenGeolocationLiveIntro()).toBe(true)
  })

  it('parses coordinates with comma decimals', () => {
    expect(parseGpsCoordinate('54,123')).toBeCloseTo(54.123)
  })

  it('normalizes valid lat/lng', () => {
    expect(normalizeGpsCoordinates('54.1', '10.2')).toEqual({
      lat: '54.100000',
      lng: '10.200000'
    })
  })

  it('rejects out-of-range values', () => {
    expect(normalizeGpsCoordinates('91', '0')).toBeNull()
    expect(normalizeGpsCoordinates('0', '181')).toBeNull()
  })

  it('reports unsupported when geolocation API is missing', async () => {
    vi.stubGlobal('navigator', { geolocation: undefined })
    await expect(getCurrentPosition({ timeoutMs: 100 })).rejects.toThrow('geolocation_unavailable')
  })

  it('rejects when the browser never calls back (watchdog)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: () => {
          // Simulate a hung desktop location service.
        }
      }
    })

    const promise = getCurrentPosition({ timeoutMs: 50, enableHighAccuracy: false })
    const assertion = expect(promise).rejects.toThrow('geolocation_timeout')
    await vi.advanceTimersByTimeAsync(900)
    await assertion
    vi.useRealTimers()
  })

  it('resolves coordinates from getCurrentPosition', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: { latitude: 59.91, longitude: 10.75, speed: 2.5, accuracy: 12 }
          } as GeolocationPosition)
        }
      }
    })

    await expect(getCurrentPosition({ timeoutMs: 1000, enableHighAccuracy: false })).resolves.toEqual({
      lat: '59.910000',
      lng: '10.750000',
      speedKn: 4.9,
      accuracyM: 12,
      signalQuality: 'excellent'
    })
  })

  it('formats GPS accuracy for display', () => {
    expect(formatGpsAccuracyMeters(12.4)).toBe('12')
    expect(formatGpsAccuracyMeters(87)).toBe('87')
    expect(formatGpsAccuracyMeters(105)).toBe('110')
    expect(formatGpsAccuracyMeters(247)).toBe('250')
  })

  it('classifies GPS accuracy into signal quality', () => {
    expect(classifyGpsAccuracyMeters(8)).toBe('excellent')
    expect(classifyGpsAccuracyMeters(30)).toBe('good')
    expect(classifyGpsAccuracyMeters(80)).toBe('fair')
    expect(classifyGpsAccuracyMeters(250)).toBe('poor')
    expect(classifyGpsAccuracyMeters(null)).toBe('unknown')
  })

  it('maps GeolocationPositionError codes to reasons', () => {
    expect(getGeolocationErrorReason({ code: 1 } as GeolocationPositionError)).toBe('permission_denied')
    expect(getGeolocationErrorReason({ code: 2 } as GeolocationPositionError)).toBe('position_unavailable')
    expect(getGeolocationErrorReason({ code: 3 } as GeolocationPositionError)).toBe('timeout')
    expect(getGeolocationErrorReason(new Error('geolocation_timeout'))).toBe('timeout')
    expect(getGeolocationErrorReason(new Error('geolocation_unavailable'))).toBe('unavailable')
    expect(geolocationErrorI18nKey('permission_denied')).toBe('logs.gps_permission_denied')
  })

  it('reads permission state when supported', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {},
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' })
      }
    })
    await expect(queryGeolocationPermission()).resolves.toBe('denied')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
