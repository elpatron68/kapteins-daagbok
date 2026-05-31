import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enJson from './locales/en.json'
import deJson from './locales/de.json'
import { initSeo } from '../utils/seo.js'

/** JSON files wrap strings in `translation` — register that namespace explicitly. */
const resources = {
  en: { translation: enJson.translation },
  de: { translation: deJson.translation }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS: 'translation',
    fallbackLng: 'en',
    supportedLngs: ['de', 'en'],
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
