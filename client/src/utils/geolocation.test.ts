import { describe, expect, it } from 'vitest'
import { normalizeGpsCoordinates, parseGpsCoordinate } from './geolocation.js'

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
})
