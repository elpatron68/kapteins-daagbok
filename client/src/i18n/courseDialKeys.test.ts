import { describe, expect, it } from 'vitest'
import deJson from './locales/de.json'
import enJson from './locales/en.json'

const resources = {
  de: { translation: deJson.translation },
  en: { translation: enJson.translation }
}

describe('course dial i18n keys', () => {
  it.each([
    'logs.event_course_section',
    'logs.course_tab_mgk',
    'logs.course_tab_rwk',
    'logs.course_dial_hint',
    'logs.course_step_fine',
    'logs.wind_mode_cardinal'
  ])('resolves %s in de and en bundles', async (key) => {
    const { default: i18n } = await import('i18next')
    await i18n.init({ lng: 'de', resources, defaultNS: 'translation' })
    expect(i18n.t(key)).not.toBe(key)
    await i18n.changeLanguage('en')
    expect(i18n.t(key)).not.toBe(key)
  })
})
