import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { decryptJson } from './crypto.js'
import type { VesselData } from '../types/vessel.js'
import { vesselDataFromSnapshot } from '../utils/vesselSnapshot.js'
import { loadLogbookVesselSelection } from './logbookVesselSelection.js'
import { loadVesselPoolMap } from './vesselPool.js'

/** Resolved vessel for a logbook: selection snapshot, pool, or legacy per-logbook yacht. */
export async function resolveVesselForLogbook(
  logbookId: string,
  options?: {
    preloadedYacht?: VesselData | Record<string, unknown> | null
    preloadedSelection?: import('../types/vessel.js').LogbookVesselSelectionData
  }
): Promise<VesselData | null> {
  if (options?.preloadedYacht) {
    return options.preloadedYacht as VesselData
  }

  const selection =
    options?.preloadedSelection ?? (logbookId === 'demo' ? null : await loadLogbookVesselSelection(logbookId))

  if (selection?.vesselSnapshot) {
    return vesselDataFromSnapshot(selection.vesselSnapshot)
  }

  if (selection?.activeVesselId && logbookId !== 'demo') {
    const pool = await loadVesselPoolMap()
    const fromPool = pool.get(selection.activeVesselId)
    if (fromPool) return fromPool
  }

  const legacy = await db.yachts.get(logbookId)
  if (!legacy) return null

  const key = (await getLogbookKey(logbookId)) || getActiveMasterKey()
  if (!key) return null

  const decrypted = (await decryptJson(legacy.encryptedData, legacy.iv, legacy.tag, key)) as
    | VesselData
    | null
  return decrypted
}
