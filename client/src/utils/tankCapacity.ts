import { formatTankLiters } from './logEntryTankLevels.js'

export interface VesselTankCapacities {
  freshwaterCapacityL?: number
  fuelCapacityL?: number
  greywaterCapacityL?: number
}

export function parseOptionalTankLiters(input: string): number | undefined {
  const trimmed = input.trim().replace(',', '.')
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('invalid_tank_liters')
  }
  return parsed
}

export function formatTankLitersForInput(liters: number): string {
  return formatTankLiters(liters)
}

function capacityFromStored(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.')
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return undefined
}

export function tankCapacityInputFromStored(value: unknown): string {
  const n = capacityFromStored(value)
  return n != null ? formatTankLitersForInput(n) : ''
}

export function extractTankCapacitiesFromYacht(decrypted: unknown): VesselTankCapacities {
  if (!decrypted || typeof decrypted !== 'object') return {}
  const y = decrypted as Record<string, unknown>
  const capacities: VesselTankCapacities = {}
  const fw = capacityFromStored(y.freshwaterCapacityL)
  const fuel = capacityFromStored(y.fuelCapacityL)
  const gw = capacityFromStored(y.greywaterCapacityL)
  if (fw != null) capacities.freshwaterCapacityL = fw
  if (fuel != null) capacities.fuelCapacityL = fuel
  if (gw != null) capacities.greywaterCapacityL = gw
  return capacities
}

/** Parse a liter amount from form state (string). */
export function parseTankLitersFromInput(input: string): number {
  const trimmed = input.trim().replace(',', '.')
  if (!trimmed) return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Max for refilled amount: remaining capacity after morning level.
 * Returns undefined when no positive max (no slider).
 */
export function computeRefilledTankMaxLiters(
  morningInput: string,
  tankCapacityL?: number
): number | undefined {
  if (tankCapacityL == null || tankCapacityL <= 0) return undefined
  const remaining = tankCapacityL - parseTankLitersFromInput(morningInput)
  if (remaining <= 0) return undefined
  return remaining
}

/**
 * Max for evening fill level: morning + refilled, capped by tank capacity when known.
 * Returns undefined when no positive max (no slider).
 */
export function computeEveningTankMaxLiters(
  morningInput: string,
  refilledInput: string,
  tankCapacityL?: number
): number | undefined {
  const sum = parseTankLitersFromInput(morningInput) + parseTankLitersFromInput(refilledInput)
  if (sum <= 0) return undefined

  if (tankCapacityL != null && tankCapacityL > 0) {
    return Math.min(tankCapacityL, sum)
  }

  return sum
}

/** Clamp numeric liter value to [0, max] when max is known. */
export function clampTankLiters(value: number, maxLiters?: number): number {
  const clamped = Math.max(0, value)
  if (maxLiters != null && maxLiters > 0) {
    return Math.min(clamped, maxLiters)
  }
  return clamped
}
