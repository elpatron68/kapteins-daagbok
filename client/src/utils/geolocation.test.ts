import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentPosition,
  normalizeGpsCoordinates,
  parseGpsCoordinate,
  queryGeolocationPermission
} from './geolocation.js'

describe('geolocation helpers', () => {
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
            coords: { latitude: 59.91, longitude: 10.75, speed: 2.5 }
          } as GeolocationPosition)
        }
      }
    })

    await expect(getCurrentPosition({ timeoutMs: 1000, enableHighAccuracy: false })).resolves.toEqual({
      lat: '59.910000',
      lng: '10.750000',
      speedKn: 4.9
    })
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
