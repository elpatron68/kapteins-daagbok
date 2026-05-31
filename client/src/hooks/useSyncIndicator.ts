import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../services/db.js'
import { subscribeToSyncState } from '../services/sync.js'

export type SyncConnStatusVariant = 'offline' | 'syncing' | 'pending' | 'online'

/** Maps sync/online state to conn-status CSS modifier classes. */
export function syncConnStatusClassName(
  online: boolean,
  showSpinner: boolean,
  pendingCount: number
): string {
  if (!online) return 'conn-status offline'
  if (showSpinner) return 'conn-status syncing'
  if (pendingCount > 0) return 'conn-status warning'
  return 'conn-status online'
}

/** Sync queue depth and whether a sync pass is running (for header indicators). */
export function useSyncIndicator(logbookId?: string | null) {
  const [isSyncing, setIsSyncing] = useState(false)

  const pendingCount =
    useLiveQuery(
      () =>
        logbookId
          ? db.syncQueue.where({ logbookId }).count()
          : db.syncQueue.count(),
      [logbookId]
    ) ?? 0

  useEffect(() => {
    return subscribeToSyncState(setIsSyncing)
  }, [])

  const showSpinner = isSyncing
  const showPendingWarning = pendingCount > 0 && !isSyncing

  return {
    isSyncing,
    pendingCount,
    showSpinner,
    showPendingWarning,
    connStatusClassName: (online: boolean) =>
      syncConnStatusClassName(online, showSpinner, pendingCount)
  }
}
