import Dexie, { type Table } from 'dexie'

export interface LocalLogbook {
  id: string
  encryptedTitle: string
  updatedAt: string
  isSynced: number // 1 = yes, 0 = pending local modifications
}

export interface LocalYacht {
  logbookId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export interface LocalCrew {
  payloadId: string
  logbookId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export interface LocalDeviation {
  logbookId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export interface LocalEntry {
  payloadId: string
  logbookId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export interface SyncQueueItem {
  id?: number
  action: 'create' | 'update' | 'delete'
  type: 'yacht' | 'crew' | 'deviation' | 'entry' | 'logbook'
  payloadId: string // payloadId or logbookId depending on the type
  logbookId: string
  data: string // JSON representation of the local record
  updatedAt: string
}

class DaagboxDatabase extends Dexie {
  logbooks!: Table<LocalLogbook>
  yachts!: Table<LocalYacht>
  crews!: Table<LocalCrew>
  deviations!: Table<LocalDeviation>
  entries!: Table<LocalEntry>
  syncQueue!: Table<SyncQueueItem>

  constructor() {
    super('DaagboxDatabase')
    this.version(1).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId'
    })
  }
}

export const db = new DaagboxDatabase()
