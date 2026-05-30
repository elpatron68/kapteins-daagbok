const API_BASE = '/api/push'

function getUserId(): string | null {
  return localStorage.getItem('active_userid')
}

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
  const userId = getUserId()
  if (!userId) return { collaboratorChangesEnabled: false }

  const res = await fetch(`${API_BASE}/prefs`, {
    headers: { 'X-User-Id': userId }
  })
  if (!res.ok) {
    throw new Error('Failed to load push notification preferences')
  }
  return res.json()
}

export async function savePushPrefs(collaboratorChangesEnabled: boolean): Promise<void> {
  const userId = getUserId()
  if (!userId) throw new Error('Not authenticated')

  const res = await fetch(`${API_BASE}/prefs`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify({ collaboratorChangesEnabled })
  })
  if (!res.ok) {
    throw new Error('Failed to save push notification preferences')
  }
}

async function saveSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const userId = getUserId()
  if (!userId) throw new Error('Not authenticated')

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid push subscription')
  }

  const locale = document.documentElement.lang?.startsWith('en') ? 'en' : 'de'

  const res = await fetch(`${API_BASE}/subscription`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      locale,
      userAgent: navigator.userAgent
    })
  })
  if (!res.ok) {
    throw new Error('Failed to register push subscription on server')
  }
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

  const userId = getUserId()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  if (userId && endpoint) {
    await fetch(`${API_BASE}/subscription`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      },
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
