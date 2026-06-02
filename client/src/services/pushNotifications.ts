import { apiFetch, apiJson } from './api.js'

const API_BASE = '/api/push'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

let cachedVapidKey: string | null = null
let cachedRegistration: ServiceWorkerRegistration | null = null

export async function preloadPushService(): Promise<void> {
  if (!isPushSupported()) return
  try {
    if (!cachedVapidKey) {
      await fetchVapidPublicKey()
    }
    if (!cachedRegistration) {
      cachedRegistration = await navigator.serviceWorker.ready
    }
  } catch (err) {
    console.warn('Failed to preload push service:', err)
  }
}

async function fetchVapidPublicKey(): Promise<string | null> {
  if (cachedVapidKey) return cachedVapidKey

  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (typeof envKey === 'string' && envKey.trim()) {
    cachedVapidKey = envKey.trim()
    return cachedVapidKey
  }

  try {
    const res = await fetch(`${API_BASE}/vapid-public-key`)
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data.publicKey === 'string') {
      cachedVapidKey = data.publicKey.trim()
      return cachedVapidKey
    }
    return null
  } catch {
    return null
  }
}

/** True when crew-change push is enabled and notification permission is granted. */
export async function isCollaboratorPushActive(): Promise<boolean> {
  if (!isPushSupported()) return false
  if (getNotificationPermission() !== 'granted') return false
  try {
    const prefs = await fetchPushPrefs()
    return prefs.collaboratorChangesEnabled
  } catch {
    return false
  }
}

export async function fetchPushPrefs(): Promise<{ collaboratorChangesEnabled: boolean }> {
  if (!localStorage.getItem('active_userid')) {
    return { collaboratorChangesEnabled: false }
  }

  return apiJson<{ collaboratorChangesEnabled: boolean }>(`${API_BASE}/prefs`)
}

export async function savePushPrefs(collaboratorChangesEnabled: boolean): Promise<void> {
  if (!localStorage.getItem('active_userid')) throw new Error('Not authenticated')

  await apiJson(`${API_BASE}/prefs`, {
    method: 'PUT',
    body: JSON.stringify({ collaboratorChangesEnabled })
  })
}

async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  
  // Try promise-based signature first
  try {
    const result = Notification.requestPermission()
    if (result !== undefined) {
      return await result
    }
  } catch {
    // Ignore and fall back to callback
  }

  // Callback-based fallback
  return new Promise<NotificationPermission>((resolve) => {
    Notification.requestPermission((permission) => {
      resolve(permission)
    })
  })
}

async function saveSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  if (!localStorage.getItem('active_userid')) throw new Error('Not authenticated')

  const endpoint = subscription.endpoint
  const json = subscription.toJSON()
  let p256dh = json.keys?.p256dh
  let auth = json.keys?.auth

  // Fallback for browsers (like Safari) that might not serialize keys in toJSON()
  if (!p256dh && typeof subscription.getKey === 'function') {
    try {
      const rawKey = subscription.getKey('p256dh')
      if (rawKey) {
        p256dh = btoa(String.fromCharCode(...new Uint8Array(rawKey)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      }
    } catch (e) {
      console.warn('Failed to extract p256dh key manually:', e)
    }
  }

  if (!auth && typeof subscription.getKey === 'function') {
    try {
      const rawAuth = subscription.getKey('auth')
      if (rawAuth) {
        auth = btoa(String.fromCharCode(...new Uint8Array(rawAuth)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      }
    } catch (e) {
      console.warn('Failed to extract auth key manually:', e)
    }
  }

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription')
  }

  const locale = document.documentElement.lang?.startsWith('en') ? 'en' : 'de'

  await apiJson(`${API_BASE}/subscription`, {
    method: 'PUT',
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      locale,
      userAgent: navigator.userAgent
    })
  })
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device')
  }

  // Pre-resolve registration with timeout to prevent silent hangs
  let registration = cachedRegistration
  if (!registration) {
    const readyPromise = navigator.serviceWorker.ready
    const readyTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout waiting for Service Worker ready state')), 8000)
    )
    registration = await Promise.race([readyPromise, readyTimeout])
    cachedRegistration = registration
  }

  const publicKey = cachedVapidKey || await fetchVapidPublicKey()
  if (!publicKey) {
    throw new Error('Push notifications are not configured on this server')
  }

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission denied')
  }

  const keyBytes = urlBase64ToUint8Array(publicKey)
  const applicationServerKey = new Uint8Array(keyBytes)
  
  // Always call subscribe with timeout to prevent silent hangs on push network errors
  const subscribePromise = registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  })
  const subscribeTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout establishing subscription with push service (FCM/APNs)')), 12000)
  )
  const subscription = await Promise.race([subscribePromise, subscribeTimeout])

  await saveSubscriptionToServer(subscription)
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return

  let registration = cachedRegistration
  if (!registration) {
    const readyPromise = navigator.serviceWorker.ready
    const readyTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout waiting for Service Worker ready state')), 8000)
    )
    registration = await Promise.race([readyPromise, readyTimeout])
    cachedRegistration = registration
  }

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  if (localStorage.getItem('active_userid') && endpoint) {
    await apiFetch(`${API_BASE}/subscription`, {
      method: 'DELETE',
      body: JSON.stringify({ endpoint })
    }).catch(() => {})
  }
}

/** Re-register subscription when prefs are on and permission already granted. */
export async function ensurePushSubscriptionIfEnabled(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return

  const prefs = await fetchPushPrefs()
  if (!prefs.collaboratorChangesEnabled) return

  try {
    await subscribeToPush()
  } catch (err) {
    console.warn('Could not refresh push subscription:', err)
  }
}

export async function enableCollaboratorChangePush(): Promise<void> {
  await subscribeToPush()
  await savePushPrefs(true)
}

export async function disableCollaboratorChangePush(): Promise<void> {
  await savePushPrefs(false)
  await unsubscribeFromPush()
}

if (isPushSupported()) {
  void preloadPushService()
}
