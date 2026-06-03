import { Coffee } from 'lucide-react'
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
        © 2026 KnorrLabs/
        <a
          href="mailto:elpatron+kd@mailbox.org"
          onClick={() => trackPlausibleEvent(PlausibleEvents.FOOTER_LINK_CLICKED)}
        >
          Markus F.J. Busche
        </a>
      </span>
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
