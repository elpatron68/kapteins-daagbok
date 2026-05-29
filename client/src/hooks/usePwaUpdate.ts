import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

function scheduleUpdateChecks(registration: ServiceWorkerRegistration): () => void {
  const checkForUpdate = () => {
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

export function usePwaUpdate() {
  const cleanupRef = useRef<(() => void) | null>(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) return

      cleanupRef.current?.()
      cleanupRef.current = scheduleUpdateChecks(registration)
    }
  })

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  const updateApp = async () => {
    await updateServiceWorker(true)
  }

  return { needRefresh, updateApp }
}
