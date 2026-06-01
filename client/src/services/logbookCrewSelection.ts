import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { decryptJson, encryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'
import type { LogbookCrewSelectionData } from '../types/person.js'
import { emptyLogbookCrewSelection } from '../types/person.js'
import { buildLogbookCrewSelection } from '../utils/personSnapshots.js'
import type { PersonData } from '../types/person.js'
import { loadPersonPoolMap } from './personPool.js'

async function resolveLogbookKey(logbookId: string): Promise<ArrayBuffer> {
  const key = (await getLogbookKey(logbookId)) || getActiveMasterKey()
  if (!key) throw new Error('Encryption key not found. Please log in.')
  return key
}

export async function loadLogbookCrewSelection(
  logbookId: string
): Promise<LogbookCrewSelectionData> {
  const record = await db.logbookCrewSelections.get(logbookId)
  if (!record) return emptyLogbookCrewSelection()

  const key = await resolveLogbookKey(logbookId)
  const data = (await decryptJson(record.encryptedData, record.iv, record.tag, key)) as
    | LogbookCrewSelectionData
    | null
  if (!data) return emptyLogbookCrewSelection()

  return {
    activeSkipperId: data.activeSkipperId ?? null,
    activeCrewIds: Array.isArray(data.activeCrewIds) ? data.activeCrewIds : [],
    snapshotsById: data.snapshotsById && typeof data.snapshotsById === 'object' ? data.snapshotsById : {}
  }
}

export async function saveLogbookCrewSelection(
  logbookId: string,
  selection: LogbookCrewSelectionData
): Promise<void> {
  const key = await resolveLogbookKey(logbookId)
  const encrypted = await encryptJson(selection, key)
  const now = new Date().toISOString()

  await db.logbookCrewSelections.put({
    logbookId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: now
  })

  await db.syncQueue.put({
    action: 'update',
    type: 'logbookCrew',
    payloadId: logbookId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

export async function saveLogbookCrewSelectionFromIds(
  logbookId: string,
  activeSkipperId: string | null,
  activeCrewIds: string[],
  poolOverride?: Map<string, PersonData>
): Promise<LogbookCrewSelectionData> {
  const pool = poolOverride ?? (await loadPersonPoolMap())
  const selection = buildLogbookCrewSelection(activeSkipperId, activeCrewIds, pool)
  await saveLogbookCrewSelection(logbookId, selection)
  return selection
}
