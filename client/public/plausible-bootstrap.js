/**
 * Loads Plausible when enabled via /runtime-config.json (from .env in Docker / Vite dev).
 * data-domain is always the current hostname (prod vs staging).
 */
(function () {
  function load(cfg) {
    if (!cfg || !cfg.plausibleEnabled || !cfg.plausibleHost) return
    var host = String(cfg.plausibleHost).replace(/\/$/, '')
    if (!host) return
    var s = document.createElement('script')
    s.defer = true
    s.dataset.domain = window.location.hostname
    s.src = host + '/js/script.tagged-events.js'
    document.head.appendChild(s)
  }

  fetch('/runtime-config.json', { cache: 'no-store' })
    .then(function (r) {
      return r.ok ? r.json() : null
    })
    .then(load)
    .catch(function () {
      /* analytics optional */
    })
})()
