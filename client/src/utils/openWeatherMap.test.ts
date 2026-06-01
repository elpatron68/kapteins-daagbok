import { describe, expect, it } from 'vitest'
import {
  formatWindStrengthBeaufort,
  mpsToBeaufort,
  parseOwmCurrentWeather
} from './openWeatherMap.js'

describe('openWeatherMap', () => {
  it('maps m/s to Beaufort', () => {
    expect(mpsToBeaufort(0)).toBe(0)
    expect(mpsToBeaufort(5)).toBe(3)
    expect(mpsToBeaufort(15)).toBe(7)
    expect(formatWindStrengthBeaufort(5)).toBe('3 Bft (5.0 m/s)')
  })

  it('parses OWM current weather payload', () => {
    const parsed = parseOwmCurrentWeather({
      wind: { speed: 8.5, deg: 225 },
      main: { pressure: 1018, temp: 17.4 },
      weather: [{ icon: '04d', description: 'Bedeckt' }]
    })
    expect(parsed.windDirection).toBe('SW')
    expect(parsed.windStrength).toBe('5 Bft (8.5 m/s)')
    expect(parsed.windPressure).toBe('1018')
    expect(parsed.tempC).toBe('17.4')
    expect(parsed.precipText).toBe('Bedeckt')
    expect(parsed.weatherIcon).toBe('04d')
  })
})
