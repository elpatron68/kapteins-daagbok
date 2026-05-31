import { describe, expect, it } from 'vitest'
import { getNextLanguage, normalizeAppLanguage, SUPPORTED_LANGUAGES } from './i18nLanguages.js'

describe('i18nLanguages', () => {
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
})
