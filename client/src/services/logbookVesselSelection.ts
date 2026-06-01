import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { decryptJson, encryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'
import type { LogbookVesselSelectionData } from '../types/vessel.js'
import { emptyLogbookVesselSelection } from '../types/vessel.js'
import { buildLogbookVesselSelection } from '../utils/vesselSnapshot.js'
import type { VesselData } from '../types/vessel.js'
import { loadVesselPoolMap } from './vesselPool.js'

async function resolveLogbookKey(logbookId: string): Promise<ArrayBuffer> {
  const key = (await getLogbookKey(logbookId)) || getActiveMasterKey()
  if (!key) throw new Error('Encryption key not found. Please log in.')
  return key
}

export async function loadLogbookVesselSelection(
  logbookId: string
): Promise<LogbookVesselSelectionData> {
  const record = await db.logbookVesselSelections.get(logbookId)
  if (!record) return emptyLogbookVesselSelection()

  const key = await resolveLogbookKey(logbookId)
  const data = (await decryptJson(record.encryptedData, record.iv, record.tag, key)) as
    | LogbookVesselSelectionData
    | null
  if (!data) return emptyLogbookVesselSelection()

  return {
    activeVesselId: data.activeVesselId ?? null,
    vesselSnapshot: data.vesselSnapshot ?? null
  }
}

export async function saveLogbookVesselSelection(
  logbookId: string,
  selection: LogbookVesselSelectionData
): Promise<void> {
  const key = await resolveLogbookKey(logbookId)
  const encrypted = await encryptJson(selection, key)
  const now = new Date().toISOString()

  await db.logbookVesselSelections.put({
    logbookId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: now
  })

  await db.syncQueue.put({
    action: 'update',
    type: 'logbookVessel',
    payloadId: logbookId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

export async function saveLogbookVesselSelectionFromId(
  logbookId: string,
  activeVesselId: string | null,
  poolOverride?: Map<string, VesselData>
): Promise<LogbookVesselSelectionData> {
  const pool = poolOverride ?? (await loadVesselPoolMap())
  const selection = buildLogbookVesselSelection(activeVesselId, pool)
  await saveLogbookVesselSelection(logbookId, selection)
  return selection
}
