import { describe, expect, it } from 'vitest'
import {
  formatAppCoordinate,
  formatAppDecimal,
  formatGpsAccuracyMeters,
  formatTankLiters,
  getNumberFormatSymbols,
  parseAppDecimal,
  resolveDeviceLocale
} from './numberFormat.js'

describe('numberFormat (device locale)', () => {
  it('resolveDeviceLocale returns a non-empty BCP 47 tag', () => {
    expect(resolveDeviceLocale().length).toBeGreaterThan(0)
  })

  it('reads decimal separator from Intl for de-DE and en-US', () => {
    expect(getNumberFormatSymbols('de-DE').decimal).toBe(',')
    expect(getNumberFormatSymbols('en-US').decimal).toBe('.')
  })

  it('formats decimals per locale without grouping', () => {
    expect(formatAppDecimal(12.5, { maximumFractionDigits: 1, locale: 'de-DE' })).toBe('12,5')
    expect(formatAppDecimal(12.5, { maximumFractionDigits: 1, locale: 'en-US' })).toBe('12.5')
    expect(formatAppDecimal(1234.5, { maximumFractionDigits: 1, locale: 'de-DE' })).toBe('1234,5')
  })

  it('parses device-locale decimals and tolerates the other separator', () => {
    expect(parseAppDecimal('12,5', 'de-DE')).toBe(12.5)
    expect(parseAppDecimal('12.5', 'en-US')).toBe(12.5)
    expect(parseAppDecimal('12,5', 'en-US')).toBe(12.5)
    expect(parseAppDecimal('1.234,5', 'de-DE')).toBe(1234.5)
    expect(parseAppDecimal('', 'de-DE')).toBeNull()
  })

  it('formats coordinates for form display', () => {
    expect(formatAppCoordinate(59.912345, 'de-DE')).toBe('59,912345')
    expect(formatTankLiters(12.5)).toBe(formatAppDecimal(12.5, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
  })

  it('formats GPS accuracy with coarse step from 100 m', () => {
    expect(formatGpsAccuracyMeters(12.4)).toBe(formatAppDecimal(12, { maximumFractionDigits: 0 }))
    expect(formatGpsAccuracyMeters(105)).toBe(formatAppDecimal(110, { maximumFractionDigits: 0 }))
  })
})
