import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import enTranslation from './locales/en.json'
import deTranslation from './locales/de.json'
import { initSeo } from '../utils/seo.js'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: enTranslation,
      de: deTranslation
    },
    fallbackLng: 'en',
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
