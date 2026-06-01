export interface SyncConflict {
  logbookId: string
  payloadId: string
  type: string
  reason: string
  queueItemId?: number
  detectedAt: string
}

const conflicts = new Map<string, SyncConflict>()
const listeners = new Set<() => void>()

function conflictKey(logbookId: string, payloadId: string, type: string): string {
  return `${logbookId}:${type}:${payloadId}`
}

export function getSyncConflicts(logbookId?: string): SyncConflict[] {
  const all = Array.from(conflicts.values())
  if (!logbookId) return all
  return all.filter((c) => c.logbookId === logbookId)
}

export function hasSyncConflicts(logbookId?: string): boolean {
  return getSyncConflicts(logbookId).length > 0
}

export function reportSyncConflict(conflict: Omit<SyncConflict, 'detectedAt'>): void {
  const key = conflictKey(conflict.logbookId, conflict.payloadId, conflict.type)
  conflicts.set(key, { ...conflict, detectedAt: new Date().toISOString() })
  listeners.forEach((l) => l())
}

export function clearSyncConflict(logbookId: string, payloadId: string, type: string): void {
  conflicts.delete(conflictKey(logbookId, payloadId, type))
  listeners.forEach((l) => l())
}

export function clearSyncConflictsForLogbook(logbookId: string): void {
  for (const key of conflicts.keys()) {
    if (key.startsWith(`${logbookId}:`)) conflicts.delete(key)
  }
  listeners.forEach((l) => l())
}

export function subscribeSyncConflicts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
