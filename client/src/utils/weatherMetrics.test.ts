import { describe, expect, it } from 'vitest'
import {
  formatPressureHpa,
  formatSeaState,
  formatVisibilityMeters,
  parseHeelDeg,
  parsePressureHpa,
  parseSeaState,
  parseVisibilityMeters,
  visibilityMetersFromStepIndex,
  visibilityStepIndex
} from './weatherMetrics.js'

describe('weatherMetrics', () => {
  it('parses and formats pressure', () => {
    expect(parsePressureHpa('1014')).toBe(1014)
    expect(parsePressureHpa('1014 hPa')).toBe(1014)
    expect(parsePressureHpa('')).toBeNull()
    expect(formatPressureHpa(1014)).toBe('1014')
  })

  it('parses and formats sea state', () => {
    expect(parseSeaState('3')).toBe(3)
    expect(parseSeaState('leicht')).toBeNull()
    expect(formatSeaState(3)).toBe('3')
  })

  it('parses and formats heel', () => {
    expect(parseHeelDeg('12')).toBe(12)
    expect(parseHeelDeg('12°')).toBe(12)
  })

  it('parses visibility with units', () => {
    expect(parseVisibilityMeters('10 km')).toBe(10000)
    expect(parseVisibilityMeters('500 m')).toBe(500)
    expect(formatVisibilityMeters(10000)).toBe('10 km')
    expect(formatVisibilityMeters(500)).toBe('500 m')
  })

  it('maps visibility to log steps', () => {
    expect(visibilityStepIndex(10000)).toBe(8)
    expect(visibilityMetersFromStepIndex(8)).toBe(10000)
    expect(visibilityMetersFromStepIndex(0)).toBe(0)
  })
})
