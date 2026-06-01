import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { decryptJson } from './crypto.js'
import { getLogbookKey } from './logbookKeys.js'
import type { PersonData } from '../types/person.js'
import { loadLogbookCrewSelection } from './logbookCrewSelection.js'
import { loadPersonPoolMap } from './personPool.js'
import { resolveVesselForLogbook } from './resolveVessel.js'
import type { LogbookSearchFields } from '../utils/logbookFilter.js'

async function loadLegacyCrewNames(logbookId: string): Promise<string[]> {
  const records = await db.crews.where({ logbookId }).toArray()
  if (records.length === 0) return []

  const key = (await getLogbookKey(logbookId)) || getActiveMasterKey()
  if (!key) return []

  const names: string[] = []
  for (const record of records) {
    const data = (await decryptJson(record.encryptedData, record.iv, record.tag, key)) as PersonData | null
    const name = data?.name?.trim()
    if (name) names.push(name)
  }
  return names
}

function collectCrewNamesFromSelection(
  selection: Awaited<ReturnType<typeof loadLogbookCrewSelection>>,
  pool: Map<string, PersonData>
): string[] {
  const names = new Set<string>()

  for (const snapshot of Object.values(selection.snapshotsById)) {
    const name = snapshot.name?.trim()
    if (name) names.add(name)
  }

  const ids = [
    ...(selection.activeSkipperId ? [selection.activeSkipperId] : []),
    ...selection.activeCrewIds
  ]
  for (const id of ids) {
    const fromSnapshot = selection.snapshotsById[id]?.name?.trim()
    if (fromSnapshot) {
      names.add(fromSnapshot)
      continue
    }
    const fromPool = pool.get(id)?.name?.trim()
    if (fromPool) names.add(fromPool)
  }

  return [...names]
}

export async function loadLogbookSearchFields(logbookId: string): Promise<LogbookSearchFields> {
  const [vessel, crewSelection, pool] = await Promise.all([
    resolveVesselForLogbook(logbookId),
    loadLogbookCrewSelection(logbookId),
    loadPersonPoolMap()
  ])

  let crewNames = collectCrewNamesFromSelection(crewSelection, pool)
  if (crewNames.length === 0) {
    crewNames = await loadLegacyCrewNames(logbookId)
  }

  return {
    vesselName: vessel?.name?.trim() ?? '',
    crewNames
  }
}

export async function loadLogbookSearchFieldsBatch(
  logbookIds: string[]
): Promise<Map<string, LogbookSearchFields>> {
  const uniqueIds = [...new Set(logbookIds)]
  const entries = await Promise.all(
    uniqueIds.map(async (id) => [id, await loadLogbookSearchFields(id)] as const)
  )
  return new Map(entries)
}
