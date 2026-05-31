import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../services/db.js'
import { subscribeToSyncState } from '../services/sync.js'

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

  useEffect(() => subscribeToSyncState(setIsSyncing), [])

  return {
    isSyncing,
    pendingCount,
    /** Spin only while a sync pass is active — not for stale queue counts. */
    showSpinner: isSyncing,
    showPendingWarning: pendingCount > 0 && !isSyncing
  }
}
