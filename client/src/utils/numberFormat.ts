/**
 * Number formatting and parsing follow the device (browser) locale from Intl,
 * not the app UI language — e.g. de-DE phone with English UI still uses comma decimals.
 */

export function resolveDeviceLocale(): string {
  try {
    const locale = new Intl.NumberFormat().resolvedOptions().locale
    if (locale) return locale
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language
  }
  return 'en-GB'
}

interface NumberSymbols {
  decimal: string
  group: string
}

const symbolCache = new Map<string, NumberSymbols>()

export function getNumberFormatSymbols(locale = resolveDeviceLocale()): NumberSymbols {
  const cached = symbolCache.get(locale)
  if (cached) return cached
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.89)
  const symbols: NumberSymbols = {
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    group: parts.find((p) => p.type === 'group')?.value ?? ''
  }
  symbolCache.set(locale, symbols)
  return symbols
}

export interface FormatAppDecimalOptions {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

/** User-visible decimal without thousands grouping. */
export function formatAppDecimal(value: number, options: FormatAppDecimalOptions = {}): string {
  if (!Number.isFinite(value)) return ''
  const locale = options.locale ?? resolveDeviceLocale()
  const min = options.minimumFractionDigits ?? 0
  const max = options.maximumFractionDigits ?? min
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: false
  }).format(value)
}

/**
 * Parses a decimal typed by the user for the device locale.
 * Also accepts the other common separator for simple values (e.g. 12,5 on en-US).
 */
export function parseAppDecimal(input: string, locale = resolveDeviceLocale()): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const { decimal, group } = getNumberFormatSymbols(locale)
  const simpleComma = /^-?\d+,\d+$/.test(trimmed)
  const simpleDot = /^-?\d+\.\d+$/.test(trimmed)

  // Values without grouping: accept locale decimal and the other common separator.
  if (simpleComma && decimal === ',') {
    return Number(trimmed.replace(',', '.'))
  }
  if (simpleDot && decimal === '.') {
    return Number(trimmed)
  }
  if (simpleComma && decimal === '.') {
    return Number(trimmed.replace(',', '.'))
  }
  if (simpleDot && decimal === ',') {
    return Number(trimmed)
  }

  let normalized = trimmed
  if (group) {
    normalized = normalized.split(group).join('')
  }
  if (decimal !== '.') {
    normalized = normalized.replace(decimal, '.')
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function parseAppDecimalOrZero(input: string, locale?: string): number {
  return parseAppDecimal(input, locale) ?? 0
}

/** Canonical storage/API coordinate string (always dot, 6 decimals). */
export function formatCanonicalCoordinate(value: number): string {
  return value.toFixed(6)
}

/** Coordinate string for form fields (device decimal separator). */
export function formatAppCoordinate(value: number, locale?: string): string {
  return formatAppDecimal(value, { minimumFractionDigits: 6, maximumFractionDigits: 6, locale })
}

export function formatNm(value: number): string {
  return formatAppDecimal(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatLiters(value: number): string {
  return Number.isInteger(value)
    ? formatAppDecimal(value, { maximumFractionDigits: 0 })
    : formatAppDecimal(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function formatHours(value: number): string {
  return formatLiters(value)
}

export function formatTankLiters(liters: number): string {
  if (!Number.isFinite(liters) || liters <= 0) return formatAppDecimal(0, { maximumFractionDigits: 0 })
  return formatLiters(liters)
}

export function formatFuelPerMotorHour(value: number | null | undefined): string {
  if (value == null) return '—'
  return Number.isInteger(value)
    ? formatAppDecimal(value, { maximumFractionDigits: 0 })
    : formatAppDecimal(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** GPS accuracy for i18n (±{{accuracy}} m): 1 m below 100 m, 10 m from 100 m upward. */
export function formatGpsAccuracyMeters(accuracyM: number): string {
  const rounded = accuracyM < 100 ? Math.round(accuracyM) : Math.round(accuracyM / 10) * 10
  return formatAppDecimal(rounded, { maximumFractionDigits: 0 })
}
