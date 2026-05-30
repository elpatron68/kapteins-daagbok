import webpush from 'web-push'
import { prisma } from '../db.js'

const THROTTLE_MS = 3 * 60 * 1000
const lastSentByLogbook = new Map<string, number>()

let vapidConfigured = false

function ensureVapid(): boolean {
  if (vapidConfigured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

function isThrottled(ownerUserId: string, logbookId: string): boolean {
  const key = `${ownerUserId}:${logbookId}`
  const last = lastSentByLogbook.get(key) ?? 0
  return Date.now() - last < THROTTLE_MS
}

function markSent(ownerUserId: string, logbookId: string): void {
  lastSentByLogbook.set(`${ownerUserId}:${logbookId}`, Date.now())
}

function notificationCopy(locale: string | null | undefined, changeCount: number): { title: string; body: string } {
  const isDe = !locale || locale.startsWith('de')
  const title = 'Kapteins Daagbok'
  if (isDe) {
    const body =
      changeCount > 1
        ? `${changeCount} neue Änderungen in einem Ihrer Logbücher.`
        : 'Neue Änderung in einem Ihrer Logbücher.'
    return { title, body }
  }
  const body =
    changeCount > 1
      ? `${changeCount} new changes in one of your logbooks.`
      : 'New change in one of your logbooks.'
  return { title, body }
}

export async function notifyOwnerOfCollaboratorChanges(
  logbookId: string,
  ownerUserId: string,
  _actorUserId: string,
  changeCount: number
): Promise<void> {
  if (!ensureVapid() || changeCount < 1) return
  if (isThrottled(ownerUserId, logbookId)) return

  const prefs = await prisma.userNotificationPrefs.findUnique({
    where: { userId: ownerUserId }
  })
  if (!prefs?.collaboratorChangesEnabled) return

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: ownerUserId }
  })
  if (subscriptions.length === 0) return

  markSent(ownerUserId, logbookId)

  const payloadBase = {
    tag: `logbook-change-${logbookId}`,
    renotify: false,
    data: {
      url: `/?logbook=${encodeURIComponent(logbookId)}`,
      logbookId,
      changeCount
    }
  }

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const { title, body } = notificationCopy(sub.locale, changeCount)
      const payload = JSON.stringify({ title, body, ...payloadBase })
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload
        )
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode: number }).statusCode
            : undefined
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        } else {
          console.warn('[push] Failed to send notification:', err)
        }
      }
    })
  )
}
