import { normalizeAppLanguage } from './i18nLanguages.js'

const INTL_LOCALES: Record<string, string> = {
  de: 'de-DE',
  en: 'en-GB',
  da: 'da-DK',
  sv: 'sv-SE',
  nb: 'nb-NO'
}

/** BCP 47 locales that use 24-hour clock for Intl formatting. */
export function resolveIntlLocale(language?: string): string {
  const lng = normalizeAppLanguage(language)
  return INTL_LOCALES[lng] ?? 'en-GB'
}

const APP_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}

const APP_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatAppDateTime(value: Date | string | number, language?: string): string {
  const date = toDate(value)
  if (!date) return String(value)
  return date.toLocaleString(resolveIntlLocale(language), APP_DATE_TIME_OPTIONS)
}

export function formatAppTime(value: Date | string | number, language?: string): string {
  const date = toDate(value)
  if (!date) return String(value)
  return date.toLocaleTimeString(resolveIntlLocale(language), APP_TIME_OPTIONS)
}
