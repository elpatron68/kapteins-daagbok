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
const VERSION_CHECK_INTERVAL_MS = 10 * 60 * 1000
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
      checkForUpdate()
    }
  }

  const onOnline = () => {
    checkForUpdate()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('online', onOnline)
  const swIntervalId = window.setInterval(() => {
    registration.update().catch(() => {})
  }, UPDATE_CHECK_INTERVAL_MS)
  const versionIntervalId = window.setInterval(() => {
    void isDeployedVersionNewer().then((outdated) => {
      if (outdated) onOutdated()
    })
  }, VERSION_CHECK_INTERVAL_MS)

  checkForUpdate()

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('online', onOnline)
    window.clearInterval(swIntervalId)
    window.clearInterval(versionIntervalId)
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
  const hardRecoveryTimerRef = useRef<number | null>(null)
  const setNeedRefreshRef = useRef<(value: boolean) => void>(() => {})

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
      setNeedRefreshRef.current(true)
    },
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return

      if (isUpdateSuppressed() || !registration.waiting) {
        setNeedRefreshRef.current(false)
      }

      cleanupRef.current?.()
      cleanupRef.current = scheduleUpdateChecks(registration, () => {
        setNeedRefreshRef.current(true)
      })
    }
  })

  setNeedRefreshRef.current = setNeedRefresh

  useEffect(() => {
    if (isUpdateSuppressed()) {
      setNeedRefresh(false)
    }

    void isDeployedVersionNewer().then((outdated) => {
      if (outdated) {
        setNeedRefresh(true)
      }
    })

    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      if (hardRecoveryTimerRef.current !== null) {
        window.clearTimeout(hardRecoveryTimerRef.current)
        hardRecoveryTimerRef.current = null
      }
    }
  }, [setNeedRefresh])

  const updateApp = async () => {
    setNeedRefresh(false)
    suppressUpdatePrompt()

    await updateServiceWorker(true)
    await triggerServiceWorkerUpdate()

    hardRecoveryTimerRef.current = window.setTimeout(() => {
      reloadForServiceWorkerTakeover()
    }, UPDATE_RELOAD_FALLBACK_MS)

    window.setTimeout(() => {
      void forcePwaRecovery()
    }, UPDATE_HARD_RECOVERY_MS)
  }

  const dismissUpdate = () => {
    setNeedRefresh(false)
    suppressUpdatePrompt(UPDATE_DISMISS_SUPPRESS_MS)
  }

  return { needRefresh, updateApp, dismissUpdate }
}
