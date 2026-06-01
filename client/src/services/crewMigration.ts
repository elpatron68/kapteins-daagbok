import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { decryptJson, encryptJson } from './crypto.js'
import { getLogbookKey } from './logbookKeys.js'
import type { PersonData } from '../types/person.js'
import { buildLogbookCrewSelection } from '../utils/personSnapshots.js'
import { entryCrewFromLogbookSelection } from '../utils/personSnapshots.js'
import { saveLogbookCrewSelection } from './logbookCrewSelection.js'
const MIGRATION_FLAG = 'crew_pool_migration_v1_done'

export async function migrateLegacyCrewToPoolIfNeeded(): Promise<void> {
  const userId = localStorage.getItem('active_userid')
  if (!userId || localStorage.getItem(MIGRATION_FLAG) === userId) return

  const masterKey = getActiveMasterKey()
  if (!masterKey) return

  try {
    const ownedLogbooks = await db.logbooks.filter((lb) => lb.isShared !== 1).toArray()
    const poolByLegacyKey = new Map<string, string>()
    const poolData = new Map<string, PersonData>()

    for (const logbook of ownedLogbooks) {
      const logbookKey = (await getLogbookKey(logbook.id)) || masterKey
      const legacyCrews = await db.crews.where({ logbookId: logbook.id }).toArray()

      const legacyIds: { skipperId: string | null; crewIds: string[] } = {
        skipperId: null,
        crewIds: []
      }

      for (const record of legacyCrews) {
        const data = (await decryptJson(record.encryptedData, record.iv, record.tag, logbookKey)) as
          | PersonData
          | null
        if (!data) continue

        const role = record.payloadId === 'skipper' ? 'skipper' : 'crew'
        const personData: PersonData = { ...data, role }
        const dedupeKey = `${role}:${personData.name}:${personData.passportNumber}`

        let poolId = poolByLegacyKey.get(dedupeKey)
        if (!poolId) {
          poolId = record.payloadId === 'skipper' ? 'skipper' : record.payloadId
          const existing = await db.personPool.get(poolId)
          if (!existing) {
            const encrypted = await encryptJson(personData, masterKey)
            const now = new Date().toISOString()
            await db.personPool.put({
              payloadId: poolId,
              encryptedData: encrypted.ciphertext,
              iv: encrypted.iv,
              tag: encrypted.tag,
              updatedAt: now
            })
            await db.userSyncQueue.put({
              action: 'create',
              type: 'person',
              payloadId: poolId,
              data: JSON.stringify(encrypted),
              updatedAt: now
            })
          }
          poolByLegacyKey.set(dedupeKey, poolId)
          poolData.set(poolId, personData)
        }

        if (role === 'skipper') legacyIds.skipperId = poolId
        else legacyIds.crewIds.push(poolId)
      }

      const existingSelection = await db.logbookCrewSelections.get(logbook.id)
      if (!existingSelection && (legacyIds.skipperId || legacyIds.crewIds.length > 0)) {
        const selection = buildLogbookCrewSelection(
          legacyIds.skipperId,
          legacyIds.crewIds,
          poolData
        )
        await saveLogbookCrewSelection(logbook.id, selection)

        const entryCrew = entryCrewFromLogbookSelection(selection)
        const entries = await db.entries.where({ logbookId: logbook.id }).toArray()
        for (const entry of entries) {
          const dec = (await decryptJson(entry.encryptedData, entry.iv, entry.tag, logbookKey)) as Record<
            string,
            unknown
          > | null
          if (!dec) continue
          if (dec.selectedSkipperId != null || (Array.isArray(dec.selectedCrewIds) && dec.selectedCrewIds.length > 0)) {
            continue
          }
          const updated = {
            ...dec,
            ...entryCrew
          }
          const encrypted = await encryptJson(updated, logbookKey)
          const now = new Date().toISOString()
          await db.entries.put({
            ...entry,
            encryptedData: encrypted.ciphertext,
            iv: encrypted.iv,
            tag: encrypted.tag,
            updatedAt: now
          })
          await db.syncQueue.put({
            action: 'update',
            type: 'entry',
            payloadId: entry.payloadId,
            logbookId: logbook.id,
            data: JSON.stringify(encrypted),
            updatedAt: now
          })
        }
      }
    }

    localStorage.setItem(MIGRATION_FLAG, userId)
  } catch (err) {
    console.warn('Crew pool migration failed:', err)
  }
}
