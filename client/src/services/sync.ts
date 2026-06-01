import { db, type SyncQueueItem } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { apiFetch } from './api.js'
import { getLogbookAccess } from './logbookAccess.js'
import {
  clearSyncConflict,
  reportSyncConflict,
  type SyncConflict
} from './syncConflicts.js'

const API_BASE = '/api/sync'
const syncingLogbooks = new Set<string>()
const pendingResync = new Set<string>()
let syncAllInFlight = 0

let isSyncing = false
const listeners = new Set<(syncing: boolean) => void>()

export function subscribeToSyncState(listener: (syncing: boolean) => void) {
  listeners.add(listener)
  listener(isSyncing)
  return () => {
    listeners.delete(listener)
  }
}

function recomputeSyncingState() {
  const syncing = syncingLogbooks.size > 0 || syncAllInFlight > 0
  if (isSyncing !== syncing) {
    isSyncing = syncing
    listeners.forEach((l) => l(isSyncing))
  }
}

// Helper to check if a timestamp is newer
function isNewer(timeA: string | Date, timeB: string | Date): boolean {
  return new Date(timeA).getTime() > new Date(timeB).getTime()
}

function entityKey(item: SyncQueueItem): string {
  return `${item.type}:${item.payloadId}`
}

function latestQueueItem(items: SyncQueueItem[]): SyncQueueItem {
  return items.reduce((a, b) => ((a.id ?? 0) > (b.id ?? 0) ? a : b))
}

async function entityExistsLocally(item: SyncQueueItem): Promise<boolean> {
  switch (item.type) {
    case 'logbook':
      return !!(await db.logbooks.get(item.payloadId))
    case 'yacht':
      return !!(await db.yachts.get(item.logbookId))
    case 'deviation':
      return !!(await db.deviations.get(item.logbookId))
    case 'crew':
      return !!(await db.crews.get(item.payloadId))
    case 'entry':
      return !!(await db.entries.get(item.payloadId))
    case 'photo':
      return !!(await db.photos.get(item.payloadId))
    case 'gpsTrack':
      return !!(await db.gpsTracks.get(item.payloadId))
    default:
      return false
  }
}

// Pick one queue entry per entity. If the record still exists locally, the latest
// action wins (supports recreate-after-delete). If it was removed locally, a delete
// wins over stale upserts with higher IDs; orphaned upserts are dropped entirely.
async function resolveCoalescedItem(group: SyncQueueItem[]): Promise<SyncQueueItem | null> {
  const exists = await entityExistsLocally(group[0])
  if (exists) {
    return latestQueueItem(group)
  }

  const deletes = group.filter((item) => item.action === 'delete')
  if (deletes.length > 0) {
    return latestQueueItem(deletes)
  }

  return null
}

async function coalesceSyncQueue(logbookId: string): Promise<SyncQueueItem[]> {
  const pending = await db.syncQueue.where({ logbookId }).toArray()
  if (pending.length <= 1) return pending

  const byEntity = new Map<string, SyncQueueItem[]>()
  for (const item of pending) {
    const key = entityKey(item)
    const group = byEntity.get(key)
    if (group) group.push(item)
    else byEntity.set(key, [item])
  }

  const kept: SyncQueueItem[] = []
  const staleIds: number[] = []

  for (const group of byEntity.values()) {
    const winner = await resolveCoalescedItem(group)

    if (winner) {
      kept.push(winner)
      for (const item of group) {
        if (item.id !== undefined && item.id !== winner.id) {
          staleIds.push(item.id)
        }
      }
    } else {
      for (const item of group) {
        if (item.id !== undefined) {
          staleIds.push(item.id)
        }
      }
    }
  }

  if (staleIds.length > 0) {
    await db.syncQueue.bulkDelete(staleIds)
  }

  return kept.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
}

function scheduleResync(logbookId: string) {
  if (pendingResync.has(logbookId)) return
  pendingResync.add(logbookId)
  queueMicrotask(() => {
    pendingResync.delete(logbookId)
    syncLogbook(logbookId).catch((err) => console.warn('Deferred sync failed:', err))
  })
}

type LogbookPushAccess = 'OWNER' | 'WRITE' | 'READ' | 'UNKNOWN'

async function resolveLogbookPushAccess(logbookId: string): Promise<LogbookPushAccess> {
  const access = await getLogbookAccess(logbookId)
  if (access) {
    return access.isOwner || access.role === 'OWNER' ? 'OWNER' : access.role
  }

  const local = await db.logbooks.get(logbookId)
  if (local?.isShared !== 1) return 'OWNER'
  if (local.collaborationRole === 'READ') return 'READ'
  if (local.collaborationRole === 'WRITE') return 'WRITE'
  return 'UNKNOWN'
}

// Push local sync queue items to the server
async function pushChanges(logbookId: string): Promise<boolean> {
  if (!getActiveMasterKey() || !localStorage.getItem('active_userid')) return false

  const pending = await coalesceSyncQueue(logbookId)
  if (pending.length === 0) return true

  const pushAccess = await resolveLogbookPushAccess(logbookId)
  if (pushAccess === 'READ' || pushAccess === 'UNKNOWN') {
    console.warn(
      `[sync] Skipping push for logbook ${logbookId} (${pushAccess}); ${pending.length} queue item(s) retained`
    )
    return false
  }

  try {
    const response = await apiFetch(`${API_BASE}/push`, {
      method: 'POST',
      body: JSON.stringify({ items: pending })
    })

    if (!response.ok) {
      console.warn('Sync push request was rejected by server')
      return false
    }

    const { results } = await response.json()

    // Match results by index — payloadId alone is not unique in the queue
    for (let i = 0; i < results.length; i++) {
      const res = results[i]
      const queueItem = pending[i]
      if (!queueItem) continue

      if (res.status === 'success') {
        if (queueItem.id !== undefined) {
          await db.syncQueue.delete(queueItem.id)
        }
        clearSyncConflict(logbookId, res.payloadId ?? queueItem.payloadId, queueItem.type)
      } else if (res.status === 'conflict') {
        reportSyncConflict({
          logbookId,
          payloadId: res.payloadId ?? queueItem.payloadId,
          type: queueItem.type,
          reason: typeof res.reason === 'string' ? res.reason : 'Server version is newer',
          queueItemId: queueItem.id
        })
      } else {
        console.error(`Sync failed for item ${res.payloadId}:`, res.error)
      }
    }
    return true
  } catch (error) {
    console.error('Error during sync push:', error)
    return false
  }
}

async function flushPushQueue(logbookId: string): Promise<boolean> {
  let ok = true
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await db.syncQueue.where({ logbookId }).count()
    if (before === 0) return ok

    const pushed = await pushChanges(logbookId)
    ok = ok && pushed

    const after = await db.syncQueue.where({ logbookId }).count()
    if (after === 0 || after === before) break
  }
  return ok
}

type PulledServerPayload = {
  yacht?: { updatedAt: string } | null
  deviation?: { updatedAt: string } | null
  crews?: Array<{ payloadId: string; updatedAt: string }>
  entries?: Array<{ payloadId: string; updatedAt: string }>
  photos?: Array<{ payloadId: string; updatedAt: string }>
  gpsTracks?: Array<{ entryId: string; updatedAt: string }>
}

/** Drop queue rows already reflected on the server (e.g. after direct API save). */
async function pruneAcknowledgedQueueItems(
  logbookId: string,
  server: PulledServerPayload
): Promise<void> {
  const pending = await db.syncQueue.where({ logbookId }).toArray()
  if (pending.length === 0) return

  const serverTimes = new Map<string, string>()
  if (server.yacht) serverTimes.set('yacht:' + logbookId, server.yacht.updatedAt)
  if (server.deviation) serverTimes.set('deviation:' + logbookId, server.deviation.updatedAt)
  for (const c of server.crews ?? []) serverTimes.set('crew:' + c.payloadId, c.updatedAt)
  for (const e of server.entries ?? []) serverTimes.set('entry:' + e.payloadId, e.updatedAt)
  for (const p of server.photos ?? []) serverTimes.set('photo:' + p.payloadId, p.updatedAt)
  for (const gt of server.gpsTracks ?? []) serverTimes.set('gpsTrack:' + gt.entryId, gt.updatedAt)

  const localLogbook = await db.logbooks.get(logbookId)
  const staleIds: number[] = []

  for (const item of pending) {
    if (item.type === 'logbook') {
      if (localLogbook?.isSynced === 1) {
        if (item.id !== undefined) staleIds.push(item.id)
      }
      continue
    }

    const key = item.type === 'yacht' ? 'yacht:' + logbookId : `${item.type}:${item.payloadId}`
    const serverUpdatedAt = serverTimes.get(key)
    if (serverUpdatedAt && !isNewer(item.updatedAt, serverUpdatedAt)) {
      if (item.id !== undefined) staleIds.push(item.id)
    }
  }

  if (staleIds.length > 0) {
    await db.syncQueue.bulkDelete(staleIds)
  }
}

// Pull updates from the server and apply last-write-wins
async function pullChanges(logbookId: string): Promise<boolean> {
  if (!localStorage.getItem('active_userid')) return false

  try {
    const response = await apiFetch(`${API_BASE}/pull?logbookId=${logbookId}`, {
      method: 'GET'
    })

    if (!response.ok) {
      console.warn('Sync pull request was rejected by server')
      return false
    }

    const { yacht, deviation, crews, entries, photos, gpsTracks } = await response.json()
    const serverSnapshot: PulledServerPayload = { yacht, deviation, crews, entries, photos, gpsTracks }

    // 1. Sync Yacht Payload
    if (yacht) {
      const local = await db.yachts.get(logbookId)
      if (!local || isNewer(yacht.updatedAt, local.updatedAt)) {
        await db.yachts.put({
          logbookId,
          encryptedData: yacht.encryptedData,
          iv: yacht.iv,
          tag: yacht.tag,
          updatedAt: yacht.updatedAt
        })
      }
    }

    // 2. Sync Deviation Payload
    if (deviation) {
      const local = await db.deviations.get(logbookId)
      if (!local || isNewer(deviation.updatedAt, local.updatedAt)) {
        await db.deviations.put({
          logbookId,
          encryptedData: deviation.encryptedData,
          iv: deviation.iv,
          tag: deviation.tag,
          updatedAt: deviation.updatedAt
        })
      }
    }

    // 3. Sync Crew List Payloads
    const serverCrewMap = new Map<string, any>()
    if (crews && Array.isArray(crews)) {
      for (const c of crews) {
        serverCrewMap.set(c.payloadId, c)
        const local = await db.crews.get(c.payloadId)
        if (!local || isNewer(c.updatedAt, local.updatedAt)) {
          await db.crews.put({
            payloadId: c.payloadId,
            logbookId,
            encryptedData: c.encryptedData,
            iv: c.iv,
            tag: c.tag,
            updatedAt: c.updatedAt
          })
        }
      }
    }

    // Deletions for Crew: If present locally but not on server, and not pending creation locally
    const localCrews = await db.crews.where({ logbookId }).toArray()
    for (const lc of localCrews) {
      if (!serverCrewMap.has(lc.payloadId)) {
        // Verify it's not a newly created item offline that hasn't synced yet
        const pendingCreate = await db.syncQueue
          .where({ payloadId: lc.payloadId, action: 'create' })
          .first()
        if (!pendingCreate) {
          await db.crews.delete(lc.payloadId)
        }
      }
    }

    // 4. Sync Journal Entry Payloads
    const serverEntryMap = new Map<string, any>()
    if (entries && Array.isArray(entries)) {
      for (const e of entries) {
        serverEntryMap.set(e.payloadId, e)
        const local = await db.entries.get(e.payloadId)
        if (!local || isNewer(e.updatedAt, local.updatedAt)) {
          await db.entries.put({
            payloadId: e.payloadId,
            logbookId,
            encryptedData: e.encryptedData,
            iv: e.iv,
            tag: e.tag,
            updatedAt: e.updatedAt
          })
        }
      }
    }

    // Deletions for Entries
    const localEntries = await db.entries.where({ logbookId }).toArray()
    for (const le of localEntries) {
      if (!serverEntryMap.has(le.payloadId)) {
        const pendingCreate = await db.syncQueue
          .where({ payloadId: le.payloadId, action: 'create' })
          .first()
        if (!pendingCreate) {
          await db.entries.delete(le.payloadId)
        }
      }
    }

    // 5. Sync Photos
    const serverPhotoMap = new Map<string, any>()
    if (photos && Array.isArray(photos)) {
      for (const p of photos) {
        serverPhotoMap.set(p.payloadId, p)
        const local = await db.photos.get(p.payloadId)
        if (!local || isNewer(p.updatedAt, local.updatedAt)) {
          await db.photos.put({
            payloadId: p.payloadId,
            entryId: p.entryId,
            logbookId,
            encryptedData: p.encryptedData,
            iv: p.iv,
            tag: p.tag,
            caption: '', // caption is stored inside encryptedData JSON
            updatedAt: p.updatedAt
          })
        }
      }
    }

    // Deletions for Photos
    const localPhotos = await db.photos.where({ logbookId }).toArray()
    for (const lp of localPhotos) {
      if (!serverPhotoMap.has(lp.payloadId)) {
        const pendingCreate = await db.syncQueue
          .where({ payloadId: lp.payloadId, action: 'create' })
          .first()
        if (!pendingCreate) {
          await db.photos.delete(lp.payloadId)
        }
      }
    }

    // 6. Sync GPS Tracks
    const serverGpsTrackMap = new Map<string, any>()
    if (gpsTracks && Array.isArray(gpsTracks)) {
      for (const gt of gpsTracks) {
        serverGpsTrackMap.set(gt.entryId, gt)
        const local = await db.gpsTracks.get(gt.entryId)
        if (!local || isNewer(gt.updatedAt, local.updatedAt)) {
          await db.gpsTracks.put({
            entryId: gt.entryId,
            logbookId,
            encryptedData: gt.encryptedData,
            iv: gt.iv,
            tag: gt.tag,
            updatedAt: gt.updatedAt
          })
        }
      }
    }

    // Deletions for GPS Tracks
    const localGpsTracks = await db.gpsTracks.where({ logbookId }).toArray()
    for (const lgt of localGpsTracks) {
      if (!serverGpsTrackMap.has(lgt.entryId)) {
        const pendingCreate = await db.syncQueue
          .where({ payloadId: lgt.entryId, action: 'create' })
          .first()
        if (!pendingCreate) {
          await db.gpsTracks.delete(lgt.entryId)
        }
      }
    }

    await pruneAcknowledgedQueueItems(logbookId, serverSnapshot)
    return true
  } catch (error) {
    console.error('Error during sync pull:', error)
    return false
  }
}

// Main function to synchronize a specific logbook
export async function syncLogbook(logbookId: string): Promise<boolean> {
  if (!navigator.onLine) return false

  const masterKey = getActiveMasterKey()
  if (!masterKey) return false

  if (syncingLogbooks.has(logbookId)) {
    scheduleResync(logbookId)
    return false
  }

  syncingLogbooks.add(logbookId)
  recomputeSyncingState()

  try {
    const pushed = await flushPushQueue(logbookId)
    const pulled = await pullChanges(logbookId)
    // Push again in case pull surfaced nothing but queue grew during pull
    const pushedAfterPull = await flushPushQueue(logbookId)
    return pushed && pulled && pushedAfterPull
  } finally {
    syncingLogbooks.delete(logbookId)
    recomputeSyncingState()
  }
}

// Synchronize all user logbooks that are cached locally
export async function syncAllLogbooks(): Promise<void> {
  if (!navigator.onLine) return

  const masterKey = getActiveMasterKey()
  if (!masterKey) return

  syncAllInFlight++
  recomputeSyncingState()
  try {
    // 1. Fetch latest logbook lists first (synchronizes db.logbooks index)
    const logbooks = await db.logbooks.toArray()

    // 2. Synchronize payloads for each logbook
    for (const lb of logbooks) {
      await syncLogbook(lb.id)
    }

    // 3. Clean up orphaned queue items for logbooks no longer in db.logbooks.
    // Re-read logbooks so any logbooks created during step 2 are included.
    const freshLogbooks = await db.logbooks.toArray()
    const freshKnownIds = new Set(freshLogbooks.map((l) => l.id))
    const currentQueue = await db.syncQueue.toArray()
    const orphanedIds = currentQueue
      .filter((i) => !freshKnownIds.has(i.logbookId))
      .map((i) => i.id!)
      .filter(Boolean)
    if (orphanedIds.length > 0) {
      await db.syncQueue.bulkDelete(orphanedIds)
    }
  } catch (error) {
    console.error('Error synchronizing all logbooks:', error)
  } finally {
    syncAllInFlight = Math.max(0, syncAllInFlight - 1)
    recomputeSyncingState()
  }
}

// Setup background sync intervals
let syncIntervalId: ReturnType<typeof setInterval> | null = null

export function startBackgroundSync(intervalMs = 30000) {
  if (syncIntervalId) clearInterval(syncIntervalId)

  // Trigger immediate sync
  syncAllLogbooks()

  // Set interval
  syncIntervalId = setInterval(() => {
    syncAllLogbooks()
  }, intervalMs)
}

export function stopBackgroundSync() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId)
    syncIntervalId = null
  }
}

/** Accept server version: pull latest and drop the conflicting queue item. */
export async function resolveSyncConflictUseServer(conflict: SyncConflict): Promise<void> {
  if (conflict.queueItemId !== undefined) {
    await db.syncQueue.delete(conflict.queueItemId)
  } else {
    const pending = await db.syncQueue
      .where({ logbookId: conflict.logbookId })
      .filter(
        (item) => item.payloadId === conflict.payloadId && item.type === conflict.type
      )
      .toArray()
    const ids = pending.map((p) => p.id).filter((id): id is number => id !== undefined)
    if (ids.length > 0) await db.syncQueue.bulkDelete(ids)
  }
  clearSyncConflict(conflict.logbookId, conflict.payloadId, conflict.type)
  await pullChanges(conflict.logbookId)
}

/** Keep local version: bump queue timestamp and retry push. */
export async function resolveSyncConflictKeepLocal(conflict: SyncConflict): Promise<void> {
  const bump = new Date(Date.now() + 1000).toISOString()
  if (conflict.queueItemId !== undefined) {
    await db.syncQueue.update(conflict.queueItemId, { updatedAt: bump })
  } else {
    const pending = await db.syncQueue
      .where({ logbookId: conflict.logbookId })
      .filter(
        (item) => item.payloadId === conflict.payloadId && item.type === conflict.type
      )
      .toArray()
    for (const item of pending) {
      if (item.id !== undefined) {
        await db.syncQueue.update(item.id, { updatedAt: bump })
      }
    }
  }
  clearSyncConflict(conflict.logbookId, conflict.payloadId, conflict.type)
  await flushPushQueue(conflict.logbookId)
}
