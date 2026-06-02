import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import {
  forcePwaRecovery,
  markReloadAttempt,
  recentlyAttemptedReload,
  triggerServiceWorkerUpdate
} from '../services/pwaStartup.js'
import { isDeployedVersionNewer } from '../services/pwaVersion.js'

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000
const UPDATE_SUPPRESS_KEY = 'pwa_update_suppress_until'
const UPDATE_SUPPRESS_MS = 30_000
const UPDATE_DISMISS_SUPPRESS_MS = 15 * 60 * 1000
const UPDATE_RELOAD_FALLBACK_MS = 2_000
const UPDATE_HARD_RECOVERY_MS = 5_000

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

function scheduleUpdateChecks(
  registration: ServiceWorkerRegistration,
  onOutdated: () => void
): () => void {
  const checkForUpdate = () => {
    if (isUpdateSuppressed()) return
    registration.update().catch(() => {})
    void isDeployedVersionNewer().then((outdated) => {
      if (outdated) onOutdated()
    })
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      // Delay check on wake-up to allow the mobile network stack to stabilize
      setTimeout(checkForUpdate, 2000)
    }
  }

  const onOnline = () => {
    // Small delay to ensure connection is fully established
    setTimeout(checkForUpdate, 500)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('online', onOnline)
  const updateIntervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)

  checkForUpdate()

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onOnline)
    window.clearInterval(updateIntervalId)
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
  const reloadFallbackTimerRef = useRef<number | null>(null)
  const forceRecoveryTimerRef = useRef<number | null>(null)
  const setNeedRefreshRef = useRef<((value: boolean) => void) | null>(null)
  const pendingNeedRefreshRef = useRef<boolean | null>(null)

  const applyNeedRefresh = (value: boolean) => {
    if (setNeedRefreshRef.current) {
      setNeedRefreshRef.current(value)
      return
    }
    pendingNeedRefreshRef.current = value
  }

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: !import.meta.env.DEV,
    onNeedReload() {
      if (isUpdateSuppressed()) return
      applyNeedRefresh(true)
    },
    onNeedRefresh() {
      if (isUpdateSuppressed()) return
      applyNeedRefresh(true)
    },
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return

      if (isUpdateSuppressed() || !registration.waiting) {
        applyNeedRefresh(false)
      }

      cleanupRef.current?.()
      cleanupRef.current = scheduleUpdateChecks(registration, () => {
        if (isUpdateSuppressed()) return
        applyNeedRefresh(true)
      })
    }
  })

  setNeedRefreshRef.current = setNeedRefresh

  useEffect(() => {
    if (isUpdateSuppressed()) {
      setNeedRefresh(false)
    } else if (pendingNeedRefreshRef.current !== null) {
      const pending = pendingNeedRefreshRef.current
      pendingNeedRefreshRef.current = null
      setNeedRefresh(pending)
    }

    void isDeployedVersionNewer().then((outdated) => {
      if (outdated) {
        setNeedRefresh(true)
      }
    })

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      if (reloadFallbackTimerRef.current !== null) {
        window.clearTimeout(reloadFallbackTimerRef.current)
        reloadFallbackTimerRef.current = null
      }
      if (forceRecoveryTimerRef.current !== null) {
        window.clearTimeout(forceRecoveryTimerRef.current)
        forceRecoveryTimerRef.current = null
      }
    }
  }, [setNeedRefresh])

  const updateApp = async () => {
    setNeedRefresh(false)
    suppressUpdatePrompt()

    await updateServiceWorker(true)
    await triggerServiceWorkerUpdate()

    if (reloadFallbackTimerRef.current !== null) {
      window.clearTimeout(reloadFallbackTimerRef.current)
    }
    if (forceRecoveryTimerRef.current !== null) {
      window.clearTimeout(forceRecoveryTimerRef.current)
    }

    reloadFallbackTimerRef.current = window.setTimeout(() => {
      reloadFallbackTimerRef.current = null
      reloadForServiceWorkerTakeover()
    }, UPDATE_RELOAD_FALLBACK_MS)

    forceRecoveryTimerRef.current = window.setTimeout(() => {
      forceRecoveryTimerRef.current = null
      void forcePwaRecovery()
    }, UPDATE_HARD_RECOVERY_MS)
  }

  const dismissUpdate = () => {
    setNeedRefresh(false)
    suppressUpdatePrompt(UPDATE_DISMISS_SUPPRESS_MS)
  }

  return { needRefresh, updateApp, dismissUpdate }
}
