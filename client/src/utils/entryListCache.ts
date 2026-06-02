import { db, type EntryListCache, type LocalEntry } from '../services/db.js'
import { getSkipperSignStatus, type SkipperSignStatus } from './signatures.js'

export type { EntryListCache }

export interface EntryListItem {
  id: string
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  updatedAt: string
  skipperSignStatus: SkipperSignStatus
}

export async function buildEntryListCache(decrypted: Record<string, unknown>): Promise<EntryListCache> {
  return {
    date: String(decrypted.date || ''),
    dayOfTravel: String(decrypted.dayOfTravel || ''),
    departure: String(decrypted.departure || ''),
    destination: String(decrypted.destination || ''),
    skipperSignStatus: await getSkipperSignStatus(decrypted)
  }
}

export function entryListItemFromLocal(entry: LocalEntry): EntryListItem | null {
  if (!entry.listCache) return null
  return {
    id: entry.payloadId,
    date: entry.listCache.date,
    dayOfTravel: entry.listCache.dayOfTravel,
    departure: entry.listCache.departure,
    destination: entry.listCache.destination,
    updatedAt: entry.updatedAt,
    skipperSignStatus: entry.listCache.skipperSignStatus
  }
}

export type LocalEntryPut = Omit<LocalEntry, 'listCache'> & { listCache?: EntryListCache }

/** Persist entry ciphertext and optional plaintext list cache for fast journal list loads. */
export async function putEntryRecord(
  record: LocalEntryPut,
  decryptedForCache?: Record<string, unknown>
): Promise<void> {
  const listCache =
    record.listCache ??
    (decryptedForCache ? await buildEntryListCache(decryptedForCache) : undefined)

  await db.entries.put({
    ...record,
    ...(listCache ? { listCache } : {})
  })
}

/** Backfill list cache after a legacy decrypt — fire-and-forget is fine. */
export function persistEntryListCache(
  payloadId: string,
  decrypted: Record<string, unknown>
): void {
  void buildEntryListCache(decrypted)
    .then((listCache) => db.entries.update(payloadId, { listCache }))
    .catch((err) => console.warn('Failed to persist entry list cache:', err))
}
