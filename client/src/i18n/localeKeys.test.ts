import { describe, expect, it } from 'vitest'
import deJson from '../i18n/locales/de.json'
import enJson from '../i18n/locales/en.json'
import daJson from '../i18n/locales/da.json'
import svJson from '../i18n/locales/sv.json'
import nbJson from '../i18n/locales/nb.json'

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys.sort()
}

const bundles = {
  de: deJson.translation,
  en: enJson.translation,
  da: daJson.translation,
  sv: svJson.translation,
  nb: nbJson.translation
} as const

describe('i18n locale key parity', () => {
  const masterKeys = collectKeys(bundles.de)

  it.each(Object.keys(bundles).filter((lang) => lang !== 'de'))(
    '%s has the same keys as de',
    (lang) => {
      const keys = collectKeys(bundles[lang as keyof typeof bundles])
      expect(keys).toEqual(masterKeys)
    }
  )
})
