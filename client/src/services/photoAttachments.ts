import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { encryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'
import { PlausibleEvents, trackPlausibleEvent } from './analytics.js'

async function getEncryptionKey(logbookId: string): Promise<ArrayBuffer> {
  const key = await getLogbookKey(logbookId) || getActiveMasterKey()
  if (!key) throw new Error('Encryption key not found. Please log in.')
  return key
}

export async function saveEntryPhoto(options: {
  logbookId: string
  entryId: string
  imageDataUrl: string
  caption?: string
  analyticsContext?: string
}): Promise<string> {
  const { logbookId, entryId, imageDataUrl, caption = '', analyticsContext = 'logbook' } = options
  const masterKey = await getEncryptionKey(logbookId)
  const photoId = window.crypto.randomUUID()
  const photoPayload = {
    image: imageDataUrl,
    caption: caption.trim()
  }

  const encrypted = await encryptJson(photoPayload, masterKey)
  const now = new Date().toISOString()

  await db.photos.put({
    payloadId: photoId,
    entryId,
    logbookId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    caption: '',
    updatedAt: now
  })

  await db.syncQueue.put({
    action: 'create',
    type: 'photo',
    payloadId: photoId,
    logbookId,
    data: JSON.stringify({
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      entryId
    }),
    updatedAt: now
  })

  trackPlausibleEvent(PlausibleEvents.PHOTO_UPLOADED, { context: analyticsContext })
  if (analyticsContext === 'live_log') {
    trackPlausibleEvent(PlausibleEvents.LIVE_LOG_PHOTO_UPLOADED)
  }
  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
  return photoId
}

export async function deleteEntryPhoto(logbookId: string, photoId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.photos.delete(photoId)
  await db.syncQueue.put({
    action: 'delete',
    type: 'photo',
    payloadId: photoId,
    logbookId,
    data: '',
    updatedAt: now
  })
  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

/** Deletes the newest photo for an entry; returns its id or null. */
export async function removeLastPhotoForEntry(
  logbookId: string,
  entryId: string
): Promise<string | null> {
  const photos = await db.photos.where({ entryId }).toArray()
  if (photos.length === 0) return null
  photos.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
  const lastId = photos[0].payloadId
  await deleteEntryPhoto(logbookId, lastId)
  return lastId
}
