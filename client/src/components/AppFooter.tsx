import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export default function AppFooter() {
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
    </footer>
  )
}
