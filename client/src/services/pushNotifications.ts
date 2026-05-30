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

async function fetchVapidPublicKey(): Promise<string | null> {
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim()
  }

  try {
    const res = await fetch(`${API_BASE}/vapid-public-key`)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.publicKey === 'string' ? data.publicKey : null
  } catch {
    return null
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

async function saveSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  if (!localStorage.getItem('active_userid')) throw new Error('Not authenticated')

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid push subscription')
  }

  const locale = document.documentElement.lang?.startsWith('en') ? 'en' : 'de'

  await apiJson(`${API_BASE}/subscription`, {
    method: 'PUT',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      locale,
      userAgent: navigator.userAgent
    })
  })
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission denied')
  }

  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) {
    throw new Error('Push notifications are not configured on this server')
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    const keyBytes = urlBase64ToUint8Array(publicKey)
    const applicationServerKey = new Uint8Array(keyBytes)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    })
  }

  await saveSubscriptionToServer(subscription)
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return

  const registration = await navigator.serviceWorker.ready
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
