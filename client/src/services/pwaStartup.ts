import { isNewerAppVersion, fetchDeployedVersion, getAppVersion } from './pwaVersion.js'

const RELOAD_ATTEMPT_KEY = 'pwa_reload_attempt_ts'
const COLD_START_UPDATE_KEY = 'pwa_coldstart_update_ts'
const HARD_RECOVERY_KEY = 'pwa_hard_recovery_ts'
const STALE_RECOVERY_COUNT_KEY = 'pwa_stale_recovery_count'
const STALE_RECOVERY_LAST_KEY = 'pwa_stale_recovery_last_ts'
const STALE_RECOVERY_WINDOW_MS = 60_000
const RELOAD_DEBOUNCE_MS = 4_000
const COLD_START_UPDATE_DEBOUNCE_MS = 15_000
const HARD_RECOVERY_DEBOUNCE_MS = 30_000

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

function recentlyAttemptedHardRecovery(now = Date.now()): boolean {
  const last = Number(sessionStorage.getItem(HARD_RECOVERY_KEY) || '0')
  return now - last < HARD_RECOVERY_DEBOUNCE_MS
}

function markHardRecoveryAttempt(now = Date.now()): void {
  sessionStorage.setItem(HARD_RECOVERY_KEY, String(now))
}

function resetStaleRecoveryCount(): void {
  sessionStorage.removeItem(STALE_RECOVERY_COUNT_KEY)
  sessionStorage.removeItem(STALE_RECOVERY_LAST_KEY)
}

function incrementStaleRecoveryCount(now = Date.now()): number {
  const last = Number(sessionStorage.getItem(STALE_RECOVERY_LAST_KEY) || '0')
  let current = Number(sessionStorage.getItem(STALE_RECOVERY_COUNT_KEY) || '0')

  if (now - last > STALE_RECOVERY_WINDOW_MS) {
    current = 0
  }

  const next = current + 1
  sessionStorage.setItem(STALE_RECOVERY_COUNT_KEY, String(next))
  sessionStorage.setItem(STALE_RECOVERY_LAST_KEY, String(now))
  return next
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
    message.includes('error loading dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError') ||
    message.includes('Unable to preload CSS')
  )
}

export async function clearPwaCachesAndWorkers(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
}

/**
 * Last-resort recovery when soft reloads cannot escape a stale precache.
 * Equivalent to manually clearing site data / reinstalling the PWA.
 */
export async function forcePwaRecovery(): Promise<boolean> {
  if (recentlyAttemptedHardRecovery()) return false

  markHardRecoveryAttempt()
  markReloadAttempt()
  resetStaleRecoveryCount()
  await clearPwaCachesAndWorkers()
  window.location.reload()
  return true
}

async function waitForWaitingWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs: number
): Promise<ServiceWorker | null> {
  if (registration.waiting) {
    return registration.waiting
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), timeoutMs)

    const inspectWorker = (worker: ServiceWorker | null) => {
      if (!worker) return

      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        window.clearTimeout(timeoutId)
        resolve(worker)
        return
      }

      worker.addEventListener(
        'statechange',
        () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.clearTimeout(timeoutId)
            resolve(worker)
          }
        },
        { once: true }
      )
    }

    inspectWorker(registration.installing)

    registration.addEventListener(
      'updatefound',
      () => {
        inspectWorker(registration.installing)
      },
      { once: true }
    )
  })
}

export async function triggerServiceWorkerUpdate(timeoutMs = 5_000): Promise<boolean> {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return false
  }

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return false

  try {
    await registration.update()
  } catch {
    return false
  }

  const waiting = await waitForWaitingWorker(registration, timeoutMs)
  return waiting !== null
}

async function activateWaitingWorker(waiting: ServiceWorker): Promise<boolean> {
  const currentController = navigator.serviceWorker.controller?.scriptURL ?? null
  waiting.postMessage({ type: 'SKIP_WAITING' })

  return new Promise<boolean>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(false), 4_000)
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.clearTimeout(timeoutId)
        const nextController = navigator.serviceWorker.controller?.scriptURL ?? null
        resolve(nextController !== null && nextController !== currentController)
      },
      { once: true }
    )
  })
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
  let waiting = registration?.waiting ?? null

  if (!waiting && registration) {
    await registration.update().catch(() => {})
    waiting = await waitForWaitingWorker(registration, 4_000)
  }

  if (!waiting || !navigator.serviceWorker.controller) {
    return false
  }

  const activated = await activateWaitingWorker(waiting)
  if (activated) {
    markColdStartUpdateAttempt()
  }
  return activated
}

/**
 * Compare deployed version.json with the bundled app version.
 * When the server is ahead, try a soft SW takeover before hard recovery.
 */
export async function reconcileVersionOnStartup(): Promise<'reload' | 'recovered' | 'noop'> {
  if (import.meta.env.DEV || !navigator.onLine) {
    return 'noop'
  }

  const deployedVersion = await fetchDeployedVersion()
  if (!deployedVersion || !isNewerAppVersion(deployedVersion, getAppVersion())) {
    return 'noop'
  }

  const reconciled = await reconcileServiceWorkerOnStartup()
  if (reconciled) {
    return 'reload'
  }

  const updated = await triggerServiceWorkerUpdate()
  if (updated) {
    const registration = await navigator.serviceWorker.getRegistration()
    const waiting = registration?.waiting
    if (waiting) {
      const activated = await activateWaitingWorker(waiting)
      if (activated) {
        markColdStartUpdateAttempt()
        return 'reload'
      }
    }
  }

  if (!recentlyAttemptedHardRecovery()) {
    const recovered = await forcePwaRecovery()
    if (recovered) {
      return 'recovered'
    }
  }

  return 'noop'
}

export function installStaleAssetRecovery(): void {
  if (import.meta.env.DEV) return

  const recoverFromStaleAssets = () => {
    if (recentlyAttemptedReload()) return

    const attempts = incrementStaleRecoveryCount()
    markReloadAttempt()

    if (attempts >= 2) {
      void forcePwaRecovery()
      return
    }

    window.location.reload()
  }

  window.addEventListener('unhandledrejection', (event) => {
    if (!isStaleModuleLoadError(event.reason)) return
    event.preventDefault()
    recoverFromStaleAssets()
  })

  window.addEventListener(
    'error',
    (event) => {
      if (!isStaleModuleLoadError(event.message)) return
      recoverFromStaleAssets()
    },
    true
  )
}
