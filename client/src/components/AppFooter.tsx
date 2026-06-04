import { Coffee, Mail, Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const KOFI_URL = 'https://ko-fi.com/kapteinsdaagbok'

export default function AppFooter() {
  const { t } = useTranslation()

  return (
    <footer className="app-version-footer">
      <span className="app-version-footer__version">v{APP_VERSION}</span>
      <span className="app-version-footer__sep" aria-hidden="true">
        ·
      </span>
      <span className="app-version-footer__copyright">
        © 2026
      </span>
      <span className="app-version-footer__sep" aria-hidden="true">
        ·
      </span>
      <a
        className="knorrlabs-footer-badge"
        href="https://dashy.elpatron.me/"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackPlausibleEvent(PlausibleEvents.FOOTER_LINK_CLICKED)}
      >
        <Compass size={14} aria-hidden="true" />
        <span>KnorrLabs</span>
      </a>
      <span className="app-version-footer__sep" aria-hidden="true">
        ·
      </span>
      <a
        className="mail-footer-badge"
        href="mailto:moin@kapteins-daagbok.eu"
        onClick={() => trackPlausibleEvent(PlausibleEvents.FOOTER_LINK_CLICKED)}
      >
        <Mail size={14} aria-hidden="true" />
        <span>moin@kapteins-daagbok.eu</span>
      </a>
      <span className="app-version-footer__sep" aria-hidden="true">
        ·
      </span>
      <a
        className="kofi-footer-badge"
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        title={t('footer.kofi_title')}
        aria-label={t('footer.kofi_title')}
        onClick={() => trackPlausibleEvent(PlausibleEvents.KOFI_LINK_CLICKED)}
      >
        <Coffee size={14} aria-hidden="true" />
        <span>{t('footer.kofi_label')}</span>
      </a>
    </footer>
  )
}
