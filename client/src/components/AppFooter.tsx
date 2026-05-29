const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export default function AppFooter() {
  return (
    <footer className="app-version-footer">
      <span className="app-version-footer__version">v{APP_VERSION}</span>
      <span className="app-version-footer__sep" aria-hidden="true">
        ·
      </span>
      <a className="app-version-footer__copyright" href="mailto:elpatron+kd@mailbox.org">
        © 2026 Markus F.J. Busche
      </a>
    </footer>
  )
}
