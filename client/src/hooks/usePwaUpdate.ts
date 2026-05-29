import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

function scheduleUpdateChecks(registration: ServiceWorkerRegistration) {
  const checkForUpdate = () => {
    registration.update().catch(() => {})
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate()
    }
  })

  window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)
}

export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (registration) {
        scheduleUpdateChecks(registration)
      }
    }
  })

  const updateApp = async () => {
    await updateServiceWorker(true)
  }

  return { needRefresh, updateApp }
}
