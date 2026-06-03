import { degreesToCardinal } from './courseAngle.js'
import { formatAppDecimal } from './numberFormat.js'
import { formatVisibilityMeters } from './weatherMetrics.js'

/** @deprecated Use formatVisibilityMeters */
export const formatOwmVisibilityMeters = formatVisibilityMeters

export interface ParsedOwmCurrent {
  windDirection: string
  windStrength: string
  windPressure: string
  visibility: string
  tempC: string | null
  precipText: string | null
  weatherIcon: string | null
}

/** Beaufort scale from wind speed in m/s (OWM `wind.speed`). */
export function mpsToBeaufort(mps: number): number {
  if (mps < 0.3) return 0
  if (mps < 1.6) return 1
  if (mps < 3.4) return 2
  if (mps < 5.5) return 3
  if (mps < 8.0) return 4
  if (mps < 10.8) return 5
  if (mps < 13.9) return 6
  if (mps < 17.2) return 7
  if (mps < 20.8) return 8
  if (mps < 24.5) return 9
  if (mps < 28.5) return 10
  if (mps < 32.7) return 11
  return 12
}

export function formatWindStrengthBeaufort(mps: number): string {
  const bft = mpsToBeaufort(mps)
  return `${bft} Bft (${formatAppDecimal(mps, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m/s)`
}

export function parseOwmCurrentWeather(data: Record<string, unknown>): ParsedOwmCurrent {
  const wind = data.wind as { speed?: number; deg?: number } | undefined
  const main = data.main as { pressure?: number; temp?: number } | undefined
  const rain = data.rain as { '1h'?: number } | undefined
  const weatherArr = data.weather as Array<{ icon?: string; description?: string }> | undefined

  const mps = wind?.speed ?? 0
  const windStrength = formatWindStrengthBeaufort(mps)
  const windDirection = wind?.deg !== undefined ? degreesToCardinal(wind.deg) : ''
  const windPressure = main?.pressure != null ? String(main.pressure) : ''

  let tempC: string | null = null
  if (main?.temp != null && Number.isFinite(main.temp)) {
    tempC = formatAppDecimal(main.temp, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }

  let precipText: string | null = null
  const firstWeather = weatherArr?.[0]
  if (firstWeather?.description?.trim()) {
    precipText = firstWeather.description.trim()
  } else if (rain?.['1h'] != null && Number.isFinite(rain['1h'])) {
    precipText = `${rain['1h']} mm/h`
  }

  const weatherIcon = firstWeather?.icon?.trim() ? firstWeather.icon.trim() : null

  const visibilityRaw = data.visibility
  const visibility =
    typeof visibilityRaw === 'number'
      ? formatVisibilityMeters(visibilityRaw)
      : ''

  return {
    windDirection,
    windStrength,
    windPressure,
    visibility,
    tempC,
    precipText,
    weatherIcon
  }
}
