import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { decryptJson, encryptJson } from './crypto.js'
import { getLogbookKey } from './logbookKeys.js'
import type { VesselData } from '../types/vessel.js'
import { buildLogbookVesselSelection } from '../utils/vesselSnapshot.js'
import { saveLogbookVesselSelection } from './logbookVesselSelection.js'

const MIGRATION_FLAG = 'vessel_pool_migration_v1_done'

function dedupeKey(data: VesselData): string {
  const reg = (data.registrationNumber || '').trim().toLowerCase()
  const name = (data.name || '').trim().toLowerCase()
  return `${reg}|${name}`
}

export async function migrateLegacyYachtsToPoolIfNeeded(): Promise<void> {
  const userId = localStorage.getItem('active_userid')
  if (!userId || localStorage.getItem(MIGRATION_FLAG) === userId) return

  const masterKey = getActiveMasterKey()
  if (!masterKey) return

  try {
    const ownedLogbooks = await db.logbooks.filter((lb) => lb.isShared !== 1).toArray()
    const poolByKey = new Map<string, string>()
    const poolData = new Map<string, VesselData>()

    for (const logbook of ownedLogbooks) {
      const logbookKey = (await getLogbookKey(logbook.id)) || masterKey
      const legacyYacht = await db.yachts.get(logbook.id)
      if (!legacyYacht) continue

      const data = (await decryptJson(
        legacyYacht.encryptedData,
        legacyYacht.iv,
        legacyYacht.tag,
        logbookKey
      )) as VesselData | null
      if (!data?.name?.trim()) continue

      const key = dedupeKey(data)
      let poolId = poolByKey.get(key)
      if (!poolId) {
        poolId = crypto.randomUUID()
        const existing = await db.vesselPool.get(poolId)
        if (!existing) {
          const encrypted = await encryptJson(data, masterKey)
          const now = new Date().toISOString()
          await db.vesselPool.put({
            payloadId: poolId,
            encryptedData: encrypted.ciphertext,
            iv: encrypted.iv,
            tag: encrypted.tag,
            updatedAt: now
          })
          await db.userSyncQueue.put({
            action: 'create',
            type: 'vessel',
            payloadId: poolId,
            data: JSON.stringify(encrypted),
            updatedAt: now
          })
        }
        poolByKey.set(key, poolId)
        poolData.set(poolId, data)
      }

      const existingSelection = await db.logbookVesselSelections.get(logbook.id)
      if (!existingSelection) {
        const selection = buildLogbookVesselSelection(poolId, poolData)
        await saveLogbookVesselSelection(logbook.id, selection)
      }
    }

    localStorage.setItem(MIGRATION_FLAG, userId)
  } catch (err) {
    console.warn('Vessel pool migration failed:', err)
  }
}
