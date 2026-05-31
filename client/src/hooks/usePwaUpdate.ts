import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { markReloadAttempt, recentlyAttemptedReload } from '../services/pwaStartup.js'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const UPDATE_SUPPRESS_KEY = 'pwa_update_suppress_until'
const UPDATE_SUPPRESS_MS = 30_000
const UPDATE_DISMISS_SUPPRESS_MS = 60 * 60 * 1000
const UPDATE_RELOAD_FALLBACK_MS = 2000

function isUpdateSuppressed(): boolean {
  const suppressUntil = Number(sessionStorage.getItem(UPDATE_SUPPRESS_KEY) || '0')
  return Date.now() < suppressUntil
}

function suppressUpdatePrompt(durationMs = UPDATE_SUPPRESS_MS): void {
  sessionStorage.setItem(UPDATE_SUPPRESS_KEY, String(Date.now() + durationMs))
}

function clearUpdateSuppression(): void {
  sessionStorage.removeItem(UPDATE_SUPPRESS_KEY)
}

function scheduleUpdateChecks(registration: ServiceWorkerRegistration): () => void {
  const checkForUpdate = () => {
    if (isUpdateSuppressed()) return
    registration.update().catch(() => {})
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate()
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.clearInterval(intervalId)
  }
}

function reloadForServiceWorkerTakeover(): void {
  if (recentlyAttemptedReload()) return
  markReloadAttempt()
  clearUpdateSuppression()
  window.location.reload()
}

export function usePwaUpdate() {
  const cleanupRef = useRef<(() => void) | null>(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: !import.meta.env.DEV,
    onNeedReload() {
      reloadForServiceWorkerTakeover()
    },
    onNeedRefresh() {
      if (isUpdateSuppressed()) return
      setNeedRefresh(true)
    },
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return

      if (isUpdateSuppressed() || !registration.waiting) {
        setNeedRefresh(false)
      }

      cleanupRef.current?.()
      cleanupRef.current = scheduleUpdateChecks(registration)
    }
  })

  useEffect(() => {
    if (isUpdateSuppressed()) {
      setNeedRefresh(false)
    }

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [setNeedRefresh])

  const updateApp = async () => {
    setNeedRefresh(false)
    suppressUpdatePrompt()

    await updateServiceWorker(true)

    // vite-plugin-pwa reloads via the "controlling" event; fallback if that does not fire.
    window.setTimeout(() => {
      reloadForServiceWorkerTakeover()
    }, UPDATE_RELOAD_FALLBACK_MS)
  }

  const dismissUpdate = () => {
    setNeedRefresh(false)
    suppressUpdatePrompt(UPDATE_DISMISS_SUPPRESS_MS)
  }

  return { needRefresh, updateApp, dismissUpdate }
}
