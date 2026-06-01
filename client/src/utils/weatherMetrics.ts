/** Barometric pressure (hPa), typical marine range. */
export const PRESSURE_MIN_HPA = 960
export const PRESSURE_MAX_HPA = 1050
export const PRESSURE_DEFAULT_HPA = 1013

/** Douglas sea state 0–9. */
export const SEA_STATE_MIN = 0
export const SEA_STATE_MAX = 9

/** Heel angle in degrees. */
export const HEEL_MIN_DEG = 0
export const HEEL_MAX_DEG = 45

/** Log-spaced visibility steps in metres; index 0 = not set. */
export const VISIBILITY_STEPS_M = [
  0, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000
] as const

function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function parsePressureHpa(value: string): number | null {
  const raw = value.trim().replace(/\s*hPa\s*$/i, '')
  if (!raw) return null
  const n = parseDecimal(raw)
  if (n == null) return null
  return clamp(Math.round(n), PRESSURE_MIN_HPA, PRESSURE_MAX_HPA)
}

export function formatPressureHpa(hpa: number): string {
  return String(clamp(Math.round(hpa), PRESSURE_MIN_HPA, PRESSURE_MAX_HPA))
}

export function parseSeaState(value: string): number | null {
  const raw = value.trim()
  if (!raw) return null
  const n = parseDecimal(raw)
  if (n == null) return null
  if (!Number.isInteger(n) || n < SEA_STATE_MIN || n > SEA_STATE_MAX) return null
  return n
}

export function formatSeaState(level: number): string {
  return String(clamp(Math.round(level), SEA_STATE_MIN, SEA_STATE_MAX))
}

export function parseHeelDeg(value: string): number | null {
  const raw = value.trim().replace(/°\s*$/, '')
  if (!raw) return null
  const n = parseDecimal(raw)
  if (n == null) return null
  return clamp(Math.round(n), HEEL_MIN_DEG, HEEL_MAX_DEG)
}

export function formatHeelDeg(deg: number): string {
  return String(clamp(Math.round(deg), HEEL_MIN_DEG, HEEL_MAX_DEG))
}

export function parseVisibilityMeters(value: string): number | null {
  const raw = value.trim()
  if (!raw) return null

  const kmMatch = raw.match(/^([\d.,]+)\s*km$/i)
  if (kmMatch) {
    const km = parseDecimal(kmMatch[1])
    return km == null ? null : Math.round(km * 1000)
  }

  const mMatch = raw.match(/^([\d.,]+)\s*m$/i)
  if (mMatch) {
    const m = parseDecimal(mMatch[1])
    return m == null ? null : Math.round(m)
  }

  const bare = parseDecimal(raw)
  if (bare == null) return null
  return Math.round(bare >= 100 ? bare : bare)
}

export function formatVisibilityMeters(meters: number): string {
  if (meters <= 0) return ''
  if (meters >= 1000) {
    const km = meters / 1000
    const rounded = Math.round(km * 10) / 10
    return Number.isInteger(rounded) ? `${rounded} km` : `${rounded.toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

export function visibilityStepIndex(meters: number): number {
  if (meters <= 0) return 0
  let bestIdx = 1
  let bestDiff = Math.abs(VISIBILITY_STEPS_M[1] - meters)
  for (let i = 2; i < VISIBILITY_STEPS_M.length; i++) {
    const diff = Math.abs(VISIBILITY_STEPS_M[i] - meters)
    if (diff < bestDiff) {
      bestDiff = diff
      bestIdx = i
    }
  }
  return bestIdx
}

export function visibilityMetersFromStepIndex(index: number): number {
  const i = clamp(Math.round(index), 0, VISIBILITY_STEPS_M.length - 1)
  return VISIBILITY_STEPS_M[i]
}

/** Re-export for OWM formatting consistency. */
export { formatOwmVisibilityMeters } from './openWeatherMap.js'
