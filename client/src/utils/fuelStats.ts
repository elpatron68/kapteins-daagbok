/** Liters per motor hour from daily fuel consumption and motor hours. */
export function computeFuelPerMotorHour(
  fuelConsumptionL: number,
  motorHours: number
): number | null {
  if (motorHours <= 0) return null
  return Number((fuelConsumptionL / motorHours).toFixed(2))
}

export function formatFuelPerMotorHour(value: number | null | undefined): string {
  if (value == null) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
