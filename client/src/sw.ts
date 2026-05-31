/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, NetworkOnly } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

const appShellFallback = createHandlerBoundToURL('/index.html')
const navigationStrategy = new NetworkFirst({
  cacheName: 'app-shell',
  networkTimeoutSeconds: 3
})

registerRoute(({ request }) => request.mode === 'navigate', async (context) => {
  try {
    return await navigationStrategy.handle(context)
  } catch {
    return appShellFallback(context)
  }
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

// Always fetch the live deploy version, even under an older precache.
registerRoute(({ url }) => url.pathname === '/version.json', new NetworkOnly())

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

interface PushPayload {
  title?: string
  body?: string
  tag?: string
  renotify?: boolean
  data?: {
    url?: string
    logbookId?: string
    changeCount?: number
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload: PushPayload = {}
      try {
        payload = event.data?.json() ?? {}
      } catch {
        payload = { body: event.data?.text() ?? '' }
      }

      const title = payload.title ?? 'Kapteins Daagbok'
      const body = payload.body ?? ''
      const data = payload.data ?? {}

      await self.registration.showNotification(title, {
        body,
        tag: payload.tag,
        icon: '/logo.png',
        badge: '/logo.png',
        data
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as PushPayload['data']
  const targetPath = data?.url ?? '/'
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus()
          client.postMessage({
            type: 'OPEN_LOGBOOK',
            logbookId: data?.logbookId
          })
          return
        }
      }

      await self.clients.openWindow(targetUrl)
    })()
  )
})
