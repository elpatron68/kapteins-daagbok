import type { i18n as I18nInstance } from 'i18next'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

/** Supported UI languages (ISO 639-1, language-only). */
export const SUPPORTED_LANGUAGES = ['de', 'en', 'da', 'sv', 'nb'] as const

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export function normalizeAppLanguage(language?: string): AppLanguage {
  const base = (language ?? 'en').split('-')[0].toLowerCase()
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(base)) {
    return base as AppLanguage
  }
  return 'en'
}

export function getNextLanguage(current?: string): AppLanguage {
  const active = normalizeAppLanguage(current)
  const index = SUPPORTED_LANGUAGES.indexOf(active)
  return SUPPORTED_LANGUAGES[(index + 1) % SUPPORTED_LANGUAGES.length]
}

export function isGermanLocale(language?: string): boolean {
  return normalizeAppLanguage(language) === 'de'
}

/** Switch UI language and track explicit user choice (not auto-detection). */
export function changeAppLanguage(i18n: I18nInstance, language: AppLanguage): void {
  const from = normalizeAppLanguage(i18n.language)
  const to = normalizeAppLanguage(language)
  if (from === to) return

  void i18n.changeLanguage(to)
  trackPlausibleEvent(PlausibleEvents.LANGUAGE_CHANGED, { from, to })
}

export function cycleAppLanguage(i18n: I18nInstance): void {
  changeAppLanguage(i18n, getNextLanguage(i18n.language))
}
