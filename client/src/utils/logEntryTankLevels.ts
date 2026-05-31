export interface TankLevels {
  morning: number
  refilled: number
  evening: number
  consumption: number
}

export interface TravelDaySortable {
  date?: string
  dayOfTravel?: string | number
}

/** Chronological order: date ascending, then day of travel ascending. */
export function compareTravelDaysChronological(a: TravelDaySortable, b: TravelDaySortable): number {
  const dateCompare = new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  if (dateCompare !== 0) return dateCompare
  return Number(a.dayOfTravel || 0) - Number(b.dayOfTravel || 0)
}

export function getNextTravelDayNumber(entries: TravelDaySortable[]): string {
  const maxDay = entries.reduce((max, entry) => Math.max(max, Number(entry.dayOfTravel) || 0), 0)
  return String(maxDay + 1)
}

/** Closing level at end of travel day: evening stand, else calculated balance, else morning. */
export function getClosingTankLevel(tank?: Partial<TankLevels> | null): number {
  if (!tank) return 0

  const evening = Number(tank.evening) || 0
  if (evening > 0) return evening

  const morning = Number(tank.morning) || 0
  const refilled = Number(tank.refilled) || 0
  const consumption = Number(tank.consumption) || 0
  const fromBalance = morning + refilled - consumption
  if (fromBalance > 0) return fromBalance

  return morning
}

export interface LogEntryTankSource {
  freshwater?: Partial<TankLevels>
  fuel?: Partial<TankLevels>
  greywater?: { level?: number }
  destination?: string
}

export interface CarryOverFromPreviousDay {
  freshwater: TankLevels
  fuel: TankLevels
  greywaterLevel: number
  departure: string
}

export function emptyTankLevels(morning = 0): TankLevels {
  return { morning, refilled: 0, evening: 0, consumption: 0 }
}

export function formatTankLiters(liters: number): string {
  if (!Number.isFinite(liters) || liters <= 0) return '0'
  return Number.isInteger(liters) ? String(liters) : liters.toFixed(1)
}

export function getClosingGreywaterLevel(greywater?: { level?: number } | null): number {
  return Number(greywater?.level) || 0
}

export function carryOverTankLevelsFromPreviousDay(previousEntry?: LogEntryTankSource | null): { freshwater: TankLevels; fuel: TankLevels } {
  if (!previousEntry) {
    return { freshwater: emptyTankLevels(), fuel: emptyTankLevels() }
  }

  return {
    freshwater: emptyTankLevels(getClosingTankLevel(previousEntry.freshwater)),
    fuel: emptyTankLevels(getClosingTankLevel(previousEntry.fuel))
  }
}

export function carryOverFromPreviousDay(previousEntry?: LogEntryTankSource | null): CarryOverFromPreviousDay {
  const { freshwater, fuel } = carryOverTankLevelsFromPreviousDay(previousEntry)
  const departure = previousEntry?.destination?.trim() || ''
  const greywaterLevel = getClosingGreywaterLevel(previousEntry?.greywater)

  return { freshwater, fuel, greywaterLevel, departure }
}

export function hasCarryOverFromPreviousDay(carryOver: CarryOverFromPreviousDay): boolean {
  return (
    carryOver.freshwater.morning > 0 ||
    carryOver.fuel.morning > 0 ||
    carryOver.greywaterLevel > 0 ||
    carryOver.departure.length > 0
  )
}
