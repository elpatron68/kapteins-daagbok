import { db } from './db.js'
import { encryptJson, decryptJson } from './crypto.js'
import { getActiveMasterKey } from './auth.js'

export interface EntryDraftRecord {
  logbookId: string
  entryId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export async function saveEntryDraft(
  logbookId: string,
  entryId: string,
  payload: unknown
): Promise<void> {
  const masterKey = getActiveMasterKey()
  if (!masterKey) return

  const { ciphertext, iv, tag } = await encryptJson(payload, masterKey)
  await db.entryDrafts.put({
    logbookId,
    entryId,
    encryptedData: ciphertext,
    iv,
    tag,
    updatedAt: new Date().toISOString()
  })
}

export async function loadEntryDraft<T = unknown>(
  logbookId: string,
  entryId: string
): Promise<T | null> {
  const masterKey = getActiveMasterKey()
  if (!masterKey) return null

  const row = await db.entryDrafts.get([logbookId, entryId])
  if (!row) return null

  try {
    return (await decryptJson(row.encryptedData, row.iv, row.tag, masterKey)) as T
  } catch {
    await db.entryDrafts.delete([logbookId, entryId])
    return null
  }
}

export async function clearEntryDraft(logbookId: string, entryId: string): Promise<void> {
  await db.entryDrafts.delete([logbookId, entryId])
}
