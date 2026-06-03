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

export async function saveEntryVoiceMemo(options: {
  logbookId: string
  entryId: string
  audioDataUrl: string
  mimeType: string
  durationSec: number
  caption?: string
  analyticsContext?: string
}): Promise<string> {
  const {
    logbookId,
    entryId,
    audioDataUrl,
    mimeType,
    durationSec,
    caption = '',
    analyticsContext = 'logbook'
  } = options
  const masterKey = await getEncryptionKey(logbookId)
  const voiceId = window.crypto.randomUUID()
  const voicePayload = {
    audio: audioDataUrl,
    mimeType,
    durationSec,
    caption: caption.trim()
  }

  const encrypted = await encryptJson(voicePayload, masterKey)
  const now = new Date().toISOString()

  await db.voiceMemos.put({
    payloadId: voiceId,
    entryId,
    logbookId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: now
  })

  await db.syncQueue.put({
    action: 'create',
    type: 'voiceMemo',
    payloadId: voiceId,
    logbookId,
    data: JSON.stringify({
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      entryId
    }),
    updatedAt: now
  })

  trackPlausibleEvent(PlausibleEvents.VOICE_MEMO_UPLOADED, { context: analyticsContext })
  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
  return voiceId
}

export async function deleteEntryVoiceMemo(logbookId: string, voiceId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.voiceMemos.delete(voiceId)
  await db.syncQueue.put({
    action: 'delete',
    type: 'voiceMemo',
    payloadId: voiceId,
    logbookId,
    data: '',
    updatedAt: now
  })
  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

/** Deletes the newest voice memo for an entry; returns its id or null. */
export async function removeLastVoiceMemoForEntry(
  logbookId: string,
  entryId: string
): Promise<string | null> {
  const memos = await db.voiceMemos.where({ entryId }).toArray()
  if (memos.length === 0) return null
  memos.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
  const lastId = memos[0].payloadId
  await deleteEntryVoiceMemo(logbookId, lastId)
  return lastId
}
