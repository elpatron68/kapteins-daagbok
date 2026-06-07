import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enJson from './locales/en.json'
import deJson from './locales/de.json'
import daJson from './locales/da.json'
import svJson from './locales/sv.json'
import nbJson from './locales/nb.json'
import frJson from './locales/fr.json'
import esJson from './locales/es.json'
import { initSeo } from '../utils/seo.js'
import { SUPPORTED_LANGUAGES } from '../utils/i18nLanguages.js'

/** JSON files wrap strings in `translation` — register that namespace explicitly. */
const resources = {
  en: { translation: enJson.translation },
  de: { translation: deJson.translation },
  da: { translation: daJson.translation },
  sv: { translation: svJson.translation },
  nb: { translation: nbJson.translation },
  fr: { translation: frJson.translation },
  es: { translation: esJson.translation }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: 'translation',
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: {
      escapeValue: false // React already escapes values (prevents XSS)
    },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lng',
      caches: ['localStorage']
    }
  })

initSeo(i18n)

export default i18n
