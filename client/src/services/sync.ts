import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'

const API_BASE = '/api/sync'
const syncingLogbooks = new Set<string>()

let isSyncing = false
const listeners = new Set<(syncing: boolean) => void>()

export function subscribeToSyncState(listener: (syncing: boolean) => void) {
  listeners.add(listener)
  listener(isSyncing)
  return () => {
    listeners.delete(listener)
  }
}

function setSyncing(syncing: boolean) {
  if (isSyncing !== syncing) {
    isSyncing = syncing
    listeners.forEach((l) => l(isSyncing))
  }
}

// Helper to check if a timestamp is newer
function isNewer(timeA: string | Date, timeB: string | Date): boolean {
  return new Date(timeA).getTime() > new Date(timeB).getTime()
}

// Push local sync queue items to the server
async function pushChanges(logbookId: string): Promise<boolean> {
  const userId = localStorage.getItem('active_userid')
  if (!userId) return false

  // Fetch all pending queue items for this logbook
  const pending = await db.syncQueue.where({ logbookId }).toArray()
  if (pending.length === 0) return true

  try {
    const response = await fetch(`${API_BASE}/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      },
      body: JSON.stringify({ items: pending })
    })

    if (!response.ok) {
      console.warn('Sync push request was rejected by server')
      return false
    }

    const { results } = await response.json()

    // Process results
    for (const res of results) {
      if (res.status === 'success' || res.status === 'conflict') {
        // Find matching queue item
        const queueItem = pending.find((item) => item.payloadId === res.payloadId)
        if (queueItem && queueItem.id !== undefined) {
          // Delete from sync queue
          await db.syncQueue.delete(queueItem.id)
        }
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

// Pull updates from the server and apply last-write-wins
async function pullChanges(logbookId: string): Promise<boolean> {
  const userId = localStorage.getItem('active_userid')
  if (!userId) return false

  try {
    const response = await fetch(`${API_BASE}/pull?logbookId=${logbookId}`, {
      method: 'GET',
      headers: {
        'X-User-Id': userId
      }
    })

    if (!response.ok) {
      console.warn('Sync pull request was rejected by server')
      return false
    }

    const { yacht, deviation, crews, entries, photos, gpsTracks } = await response.json()

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

  if (syncingLogbooks.has(logbookId)) return false
  syncingLogbooks.add(logbookId)
  setSyncing(true)

  try {
    const pushed = await pushChanges(logbookId)
    const pulled = await pullChanges(logbookId)
    return pushed && pulled;
  } finally {
    syncingLogbooks.delete(logbookId)
    setSyncing(syncingLogbooks.size > 0)
  }
}

// Synchronize all user logbooks that are cached locally
export async function syncAllLogbooks(): Promise<void> {
  if (!navigator.onLine) return

  const masterKey = getActiveMasterKey()
  if (!masterKey) return

  try {
    setSyncing(true)
    // 1. Fetch latest logbook lists first (synchronizes db.logbooks index)
    const logbooks = await db.logbooks.toArray()

    // 2. Synchronize payloads for each logbook
    for (const lb of logbooks) {
      await syncLogbook(lb.id)
    }
  } catch (error) {
    console.error('Error synchronizing all logbooks:', error)
  } finally {
    setSyncing(syncingLogbooks.size > 0)
  }
}

// Setup background sync intervals
let syncIntervalId: any = null

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
