const RELOAD_ATTEMPT_KEY = 'pwa_reload_attempt_ts'
const COLD_START_UPDATE_KEY = 'pwa_coldstart_update_ts'
const RELOAD_DEBOUNCE_MS = 4_000
const COLD_START_UPDATE_DEBOUNCE_MS = 15_000

export function recentlyAttemptedReload(now = Date.now()): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_ATTEMPT_KEY) || '0')
  return now - last < RELOAD_DEBOUNCE_MS
}

export function markReloadAttempt(now = Date.now()): void {
  sessionStorage.setItem(RELOAD_ATTEMPT_KEY, String(now))
}

function recentlyAttemptedColdStartUpdate(now = Date.now()): boolean {
  const last = Number(sessionStorage.getItem(COLD_START_UPDATE_KEY) || '0')
  return now - last < COLD_START_UPDATE_DEBOUNCE_MS
}

function markColdStartUpdateAttempt(now = Date.now()): void {
  sessionStorage.setItem(COLD_START_UPDATE_KEY, String(now))
}

function isStaleModuleLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module')
  )
}

/**
 * After missed deploys, a waiting SW may exist while the page still runs an old bundle.
 * Apply the waiting worker once on cold start (one controlled reload) instead of hanging.
 */
export async function reconcileServiceWorkerOnStartup(): Promise<boolean> {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return false
  }

  if (recentlyAttemptedColdStartUpdate()) {
    return false
  }

  const registration = await navigator.serviceWorker.getRegistration()
  const waiting = registration?.waiting
  if (!waiting || !navigator.serviceWorker.controller) {
    return false
  }

  markColdStartUpdateAttempt()
  waiting.postMessage({ type: 'SKIP_WAITING' })

  await new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(resolve, 4_000)
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.clearTimeout(timeoutId)
        resolve()
      },
      { once: true }
    )
  })

  return true
}

export function installStaleAssetRecovery(): void {
  if (import.meta.env.DEV) return

  window.addEventListener('unhandledrejection', (event) => {
    if (!isStaleModuleLoadError(event.reason)) return
    if (recentlyAttemptedReload()) return

    markReloadAttempt()
    event.preventDefault()
    window.location.reload()
  })
}
