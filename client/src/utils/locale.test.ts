import type { i18n as I18nInstance } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveIntlLocale } from './dateTimeFormat.js'
import { initSeo, normalizeSeoLang, updatePageSeo } from './seo.js'

const SUPPORTED_HTML_LANG = /^de|en|da|sv|nb$/

function createMockI18n(language: string): I18nInstance {
  return {
    isInitialized: true,
    language,
    t: (key: string) => key,
    on: vi.fn()
  } as unknown as I18nInstance
}

describe('normalizeSeoLang', () => {
  it.each([
    ['de', 'de'],
    ['de-DE', 'de'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['da', 'da'],
    ['sv-SE', 'sv'],
    ['nb-NO', 'nb']
  ] as const)('maps %s to short code %s', (input, expected) => {
    expect(normalizeSeoLang(input)).toBe(expected)
  })
})

describe('updatePageSeo html lang', () => {
  beforeEach(() => {
    document.documentElement.lang = 'de'
    window.history.replaceState({}, '', '/')
  })

  it.each([
    ['de', 'de'],
    ['en', 'en'],
    ['da', 'da'],
    ['sv', 'sv'],
    ['nb', 'nb']
  ] as const)('sets html lang to %s when i18n language is %s', (i18nLanguage, expectedLang) => {
    initSeo(createMockI18n(i18nLanguage))
    updatePageSeo()

    expect(document.documentElement.lang).toBe(expectedLang)
    expect(document.documentElement.lang).toMatch(SUPPORTED_HTML_LANG)
  })
})

describe('resolveIntlLocale', () => {
  it('uses full BCP 47 tags for Intl formatting only', () => {
    expect(resolveIntlLocale('de')).toBe('de-DE')
    expect(resolveIntlLocale('en')).toBe('en-GB')
    expect(resolveIntlLocale('da')).toBe('da-DK')
    expect(resolveIntlLocale('sv')).toBe('sv-SE')
    expect(resolveIntlLocale('nb')).toBe('nb-NO')
  })

  it('does not reuse Intl locale tags for html lang', () => {
    const intlLocale = resolveIntlLocale('nb')
    const htmlLang = normalizeSeoLang('nb')

    expect(intlLocale).toBe('nb-NO')
    expect(htmlLang).toBe('nb')
    expect(htmlLang).not.toBe(intlLocale)
  })
})
