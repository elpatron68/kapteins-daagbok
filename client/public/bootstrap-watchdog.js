/**
 * Boot watchdog for production PWAs.
 * Recovers from white/black screens when stale HTML points to missing JS chunks.
 * Does not clear caches automatically while offline to protect unsynced data.
 */
(function () {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return
  }

  var BOOT_TIMEOUT_MS = 12000
  var ATTEMPT_WINDOW_MS = 120000
  var ATTEMPT_COUNT_KEY = 'pwa_boot_watchdog_attempt_count'
  var ATTEMPT_LAST_KEY = 'pwa_boot_watchdog_attempt_last_ts'
  var PENDING_EVENTS_KEY = 'pwa_boot_pending_events'
  var MAX_PENDING_EVENTS = 12

  function enqueueEvent(name, props) {
    try {
      var current = JSON.parse(sessionStorage.getItem(PENDING_EVENTS_KEY) || '[]')
      if (!Array.isArray(current)) current = []
      current.push({ name: name, props: props, ts: Date.now() })
      if (current.length > MAX_PENDING_EVENTS) {
        current = current.slice(current.length - MAX_PENDING_EVENTS)
      }
      sessionStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(current))
    } catch (_) {
      /* ignore analytics queue errors */
    }
  }

  function emit(name, props) {
    if (typeof window.plausible === 'function') {
      if (props && Object.keys(props).length > 0) {
        window.plausible(name, { props: props })
      } else {
        window.plausible(name)
      }
      return
    }
    enqueueEvent(name, props)
  }

  function hasBootstrapped() {
    return window.__KDB_APP_BOOTSTRAPPED === true
  }

  function resetAttempts() {
    try {
      sessionStorage.removeItem(ATTEMPT_COUNT_KEY)
      sessionStorage.removeItem(ATTEMPT_LAST_KEY)
    } catch (_) {
      /* ignore storage errors */
    }
  }

  function nextAttempt() {
    try {
      var now = Date.now()
      var last = Number(sessionStorage.getItem(ATTEMPT_LAST_KEY) || '0')
      var count = Number(sessionStorage.getItem(ATTEMPT_COUNT_KEY) || '0')
      if (now - last > ATTEMPT_WINDOW_MS) {
        count = 0
      }
      count += 1
      sessionStorage.setItem(ATTEMPT_COUNT_KEY, String(count))
      sessionStorage.setItem(ATTEMPT_LAST_KEY, String(now))
      return count
    } catch (_) {
      return 1
    }
  }

  function createRecoveryUrl(reason) {
    try {
      var url = new URL(location.href)
      url.searchParams.set('boot_recover', reason)
      url.searchParams.set('_', String(Date.now()))
      return url.toString()
    } catch (_) {
      return location.href
    }
  }

  async function clearServiceWorkerCaches() {
    if ('serviceWorker' in navigator) {
      try {
        var registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations.map(function (registration) {
            return registration.unregister()
          })
        )
      } catch (_) {
        /* ignore SW cleanup errors */
      }
    }
    if ('caches' in window) {
      try {
        var keys = await caches.keys()
        await Promise.all(
          keys.map(function (key) {
            return caches.delete(key)
          })
        )
      } catch (_) {
        /* ignore cache cleanup errors */
      }
    }
  }

  function renderFallback(isOffline) {
    var root = document.getElementById('root')
    if (!root) return

    root.innerHTML =
      '<div class="auth-screen">' +
      '<div class="auth-card glass" role="alert" style="max-width:460px">' +
      '<h2 style="margin-top:0">Kapteins Daagbok</h2>' +
      '<p style="color:var(--app-text-muted);line-height:1.5;margin-bottom:8px">' +
      (isOffline
        ? 'Die App konnte offline nicht sauber starten. Deine lokalen, nicht synchronisierten Daten bleiben erhalten.'
        : 'Die App konnte nicht sauber starten. Deine lokalen, nicht synchronisierten Daten bleiben erhalten.') +
      '</p>' +
      '<p style="color:var(--app-text-muted);line-height:1.5;margin-top:0">' +
      (isOffline
        ? 'Bitte neu laden. Wenn wieder Netz verfügbar ist, kann die App-Engine automatisch repariert werden.'
        : 'Du kannst jetzt eine App-Reparatur ausfuehren, ohne IndexedDB-Logbuchdaten zu loeschen.') +
      '</p>' +
      '<button type="button" class="btn primary" id="boot-reload-btn" style="width:100%">' +
      'Neu laden' +
      '</button>' +
      (!isOffline
        ? '<button type="button" class="btn secondary" id="boot-repair-btn" style="width:100%;margin-top:12px">' +
          'App-Reparatur (Cache + Service Worker)' +
          '</button>'
        : '') +
      '</div>' +
      '</div>'

    var reloadBtn = document.getElementById('boot-reload-btn')
    if (reloadBtn) {
      reloadBtn.addEventListener('click', function () {
        location.replace(createRecoveryUrl('retry'))
      })
    }

    var repairBtn = document.getElementById('boot-repair-btn')
    if (repairBtn) {
      repairBtn.addEventListener('click', function () {
        emit('PWA Boot Watchdog Manual Repair', {
          attempt: Number(sessionStorage.getItem(ATTEMPT_COUNT_KEY) || '0'),
          online: navigator.onLine
        })
        Promise.resolve()
          .then(clearServiceWorkerCaches)
          .finally(function () {
            resetAttempts()
            location.replace(createRecoveryUrl('manual-hard-recovery'))
          })
      })
    }
  }

  function runWatchdog() {
    window.setTimeout(function () {
      if (hasBootstrapped()) {
        resetAttempts()
        return
      }

      var attempt = nextAttempt()
      var online = navigator.onLine

      if (attempt === 1) {
        emit('PWA Boot Watchdog Soft', {
          attempt: attempt,
          online: online,
          reason: online ? 'soft-reload' : 'offline-retry'
        })
        Promise.resolve()
          .then(function () {
            if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration) {
              return navigator.serviceWorker.getRegistration().then(function (registration) {
                if (registration) {
                  return registration.update().catch(function () {})
                }
              })
            }
          })
          .finally(function () {
            location.replace(createRecoveryUrl(online ? 'soft-reload' : 'offline-retry'))
          })
        return
      }

      if (attempt === 2 && online) {
        emit('PWA Boot Watchdog Hard', {
          attempt: attempt,
          online: online,
          reason: 'hard-recovery'
        })
        Promise.resolve()
          .then(clearServiceWorkerCaches)
          .finally(function () {
            location.replace(createRecoveryUrl('hard-recovery'))
          })
        return
      }

      emit('PWA Boot Watchdog Fallback', {
        attempt: attempt,
        online: online,
        reason: online ? 'retries-exhausted' : 'offline-retries-exhausted'
      })
      renderFallback(!online)
    }, BOOT_TIMEOUT_MS)
  }

  runWatchdog()
})()
