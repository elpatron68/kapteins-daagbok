import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { decryptJson, encryptJson } from './crypto.js'
import type { VesselData } from '../types/vessel.js'
import { MAX_POOL_VESSELS } from '../types/vessel.js'
import { syncVesselPool } from './vesselPoolSync.js'

export interface DecryptedVessel {
  payloadId: string
  data: VesselData
}

function requireMasterKey(): ArrayBuffer {
  const key = getActiveMasterKey()
  if (!key) throw new Error('Encryption key not found. Please log in.')
  return key
}

export async function loadVesselPool(): Promise<DecryptedVessel[]> {
  const masterKey = requireMasterKey()
  const records = await db.vesselPool.toArray()
  const result: DecryptedVessel[] = []

  for (const record of records) {
    const data = (await decryptJson(record.encryptedData, record.iv, record.tag, masterKey)) as
      | VesselData
      | null
    if (data?.name) {
      result.push({ payloadId: record.payloadId, data })
    }
  }

  result.sort((a, b) =>
    a.data.name.localeCompare(b.data.name, undefined, { sensitivity: 'base' })
  )
  return result
}

export async function loadVesselPoolMap(): Promise<Map<string, VesselData>> {
  const vessels = await loadVesselPool()
  return new Map(vessels.map((v) => [v.payloadId, v.data]))
}

export async function saveVessel(
  payloadId: string,
  data: VesselData,
  isNew: boolean
): Promise<void> {
  if (isNew) {
    const count = await db.vesselPool.count()
    if (count >= MAX_POOL_VESSELS) {
      throw new Error('MAX_VESSELS')
    }
  }

  const masterKey = requireMasterKey()
  const encrypted = await encryptJson(data, masterKey)
  const now = new Date().toISOString()

  await db.vesselPool.put({
    payloadId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: now
  })

  await db.userSyncQueue.put({
    action: isNew ? 'create' : 'update',
    type: 'vessel',
    payloadId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  syncVesselPool().catch((err) => console.warn('Vessel pool sync failed:', err))
}

export async function deleteVessel(payloadId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.vesselPool.delete(payloadId)
  await db.userSyncQueue.put({
    action: 'delete',
    type: 'vessel',
    payloadId,
    data: '',
    updatedAt: now
  })
  syncVesselPool().catch((err) => console.warn('Vessel pool sync failed:', err))
}
