import type { i18n as I18nInstance } from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlausibleEvents } from '../services/analytics.js'
import {
  changeAppLanguage,
  cycleAppLanguage,
  getNextLanguage,
  normalizeAppLanguage,
  SUPPORTED_LANGUAGES
} from './i18nLanguages.js'

const trackPlausibleEvent = vi.fn()

vi.mock('../services/analytics.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/analytics.js')>()
  return {
    ...actual,
    trackPlausibleEvent: (...args: unknown[]) => trackPlausibleEvent(...args)
  }
})

function createMockI18n(language: string): I18nInstance {
  let current = language
  return {
    language: current,
    changeLanguage: vi.fn(async (lng: string) => {
      current = lng
      ;(this as { language: string }).language = lng
    })
  } as unknown as I18nInstance
}

describe('i18nLanguages', () => {
  beforeEach(() => {
    trackPlausibleEvent.mockReset()
  })

  it('normalizes regional tags to supported base codes', () => {
    expect(normalizeAppLanguage('de-DE')).toBe('de')
    expect(normalizeAppLanguage('nb-NO')).toBe('nb')
    expect(normalizeAppLanguage('xx')).toBe('en')
  })

  it('cycles through all supported languages', () => {
    let current: string = 'de'
    const seen = new Set<string>()
    for (let i = 0; i < SUPPORTED_LANGUAGES.length; i++) {
      seen.add(current)
      current = getNextLanguage(current)
    }
    expect(seen.size).toBe(SUPPORTED_LANGUAGES.length)
    expect(current).toBe('de')
  })

  it('tracks explicit language changes', () => {
    const i18n = createMockI18n('de')
    changeAppLanguage(i18n, 'sv')

    expect(i18n.changeLanguage).toHaveBeenCalledWith('sv')
    expect(trackPlausibleEvent).toHaveBeenCalledWith(PlausibleEvents.LANGUAGE_CHANGED, {
      from: 'de',
      to: 'sv'
    })
  })

  it('does not track when language stays the same', () => {
    const i18n = createMockI18n('en')
    changeAppLanguage(i18n, 'en')

    expect(i18n.changeLanguage).not.toHaveBeenCalled()
    expect(trackPlausibleEvent).not.toHaveBeenCalled()
  })

  it('cycleAppLanguage tracks the next language', () => {
    const i18n = createMockI18n('nb')
    cycleAppLanguage(i18n)

    expect(trackPlausibleEvent).toHaveBeenCalledWith(PlausibleEvents.LANGUAGE_CHANGED, {
      from: 'nb',
      to: 'de'
    })
  })
})
