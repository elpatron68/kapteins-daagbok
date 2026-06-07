import type { i18n as I18nInstance } from 'i18next'
import { normalizeAppLanguage, type AppLanguage } from './i18nLanguages.js'

const SITE_ORIGIN = 'https://kapteins-daagbok.eu'

export type SeoLang = AppLanguage

const OG_LOCALES: Record<SeoLang, string> = {
  de: 'de_DE',
  en: 'en_GB',
  da: 'da_DK',
  sv: 'sv_SE',
  nb: 'nb_NO',
  fr: 'fr_FR',
  es: 'es_ES'
}

let i18nRef: I18nInstance | null = null

export function normalizeSeoLang(lng: string): SeoLang {
  return normalizeAppLanguage(lng)
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function syncLanguageUrl(lang: SeoLang) {
  const url = new URL(window.location.href)
  const currentLng = url.searchParams.get('lng')
  if (currentLng && normalizeSeoLang(currentLng) === lang) return

  url.searchParams.set('lng', lang)
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

export function updatePageSeo(lng?: string) {
  if (!i18nRef?.isInitialized) return

  const lang = normalizeSeoLang(lng ?? i18nRef.language)
  document.documentElement.lang = lang

  const title = i18nRef.t('seo.title')
  document.title = title

  const description = i18nRef.t('seo.description')
  const keywords = i18nRef.t('seo.keywords')
  const imageAlt = i18nRef.t('seo.ogImageAlt')

  setMeta('name', 'description', description)
  setMeta('name', 'keywords', keywords)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:locale', OG_LOCALES[lang])
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setMeta('property', 'og:image:alt', imageAlt)
  setMeta('name', 'twitter:image:alt', imageAlt)

  syncLanguageUrl(lang)
}

export function initSeo(i18n: I18nInstance) {
  i18nRef = i18n
  i18n.on('initialized', () => updatePageSeo())
  i18n.on('languageChanged', (lng) => updatePageSeo(lng))
  if (i18n.isInitialized) {
    updatePageSeo()
  }
}

export function hreflangUrl(lang: SeoLang): string {
  return `${SITE_ORIGIN}/?lng=${lang}`
}

export const seoSiteOrigin = SITE_ORIGIN
