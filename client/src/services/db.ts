import Dexie, { type Table } from 'dexie'

export interface LocalLogbook {
  id: string
  encryptedTitle: string
  updatedAt: string
  isSynced: number // 1 = yes, 0 = pending local modifications
  isShared?: number // 1 = collaborator copy, 0 or unset = owned
  isDemo?: number // 1 = demo logbook seeded at registration
  collaborationRole?: 'READ' | 'WRITE' // set when isShared = 1
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

export interface LocalPhoto {
  payloadId: string
  entryId: string
  logbookId: string
  encryptedData: string // encrypted base64 image data
  iv: string
  tag: string
  caption: string // encrypted caption
  updatedAt: string
}

export interface LocalGpsTrack {
  entryId: string // one track per daily journal entry
  logbookId: string
  encryptedData: string // encrypted waypoints JSON string
  iv: string
  tag: string
  updatedAt: string
}

export interface LocalNmeaArchive {
  entryId: string
  logbookId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export interface LocalLogbookKey {
  logbookId: string
  encryptedKey: string
  iv: string
  tag: string
}

export interface LocalPerson {
  payloadId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export interface LocalLogbookCrewSelection {
  logbookId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

export interface SyncQueueItem {
  id?: number
  action: 'create' | 'update' | 'delete'
  type: 'yacht' | 'crew' | 'deviation' | 'entry' | 'logbook' | 'photo' | 'gpsTrack' | 'logbookCrew'
  payloadId: string // payloadId or logbookId depending on the type
  logbookId: string
  data: string // JSON representation of the local record
  updatedAt: string
}

export interface UserSyncQueueItem {
  id?: number
  action: 'create' | 'update' | 'delete'
  type: 'person'
  payloadId: string
  data: string
  updatedAt: string
}

export interface EntryDraftRecord {
  logbookId: string
  entryId: string
  encryptedData: string
  iv: string
  tag: string
  updatedAt: string
}

class DaagboxDatabase extends Dexie {
  logbooks!: Table<LocalLogbook>
  yachts!: Table<LocalYacht>
  crews!: Table<LocalCrew>
  deviations!: Table<LocalDeviation>
  entries!: Table<LocalEntry>
  photos!: Table<LocalPhoto>
  gpsTracks!: Table<LocalGpsTrack>
  nmeaArchives!: Table<LocalNmeaArchive>
  logbookKeys!: Table<LocalLogbookKey>
  personPool!: Table<LocalPerson>
  logbookCrewSelections!: Table<LocalLogbookCrewSelection>
  syncQueue!: Table<SyncQueueItem>
  userSyncQueue!: Table<UserSyncQueueItem>
  entryDrafts!: Table<EntryDraftRecord, [string, string]>

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
    this.version(2).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId',
      photos: 'payloadId, entryId, logbookId, updatedAt',
      gpsTracks: 'entryId, logbookId, updatedAt'
    })
    this.version(3).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId',
      photos: 'payloadId, entryId, logbookId, updatedAt',
      gpsTracks: 'entryId, logbookId, updatedAt',
      logbookKeys: 'logbookId'
    })
    this.version(4).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced, isShared',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId',
      photos: 'payloadId, entryId, logbookId, updatedAt',
      gpsTracks: 'entryId, logbookId, updatedAt',
      logbookKeys: 'logbookId'
    })
    this.version(5).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced, isShared, isDemo',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId',
      photos: 'payloadId, entryId, logbookId, updatedAt',
      gpsTracks: 'entryId, logbookId, updatedAt',
      logbookKeys: 'logbookId'
    })
    this.version(6).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced, isShared, isDemo',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId',
      photos: 'payloadId, entryId, logbookId, updatedAt',
      gpsTracks: 'entryId, logbookId, updatedAt',
      nmeaArchives: 'entryId, logbookId, updatedAt',
      logbookKeys: 'logbookId'
    })
    this.version(7).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced, isShared, isDemo',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId',
      photos: 'payloadId, entryId, logbookId, updatedAt',
      gpsTracks: 'entryId, logbookId, updatedAt',
      nmeaArchives: 'entryId, logbookId, updatedAt',
      logbookKeys: 'logbookId',
      entryDrafts: '[logbookId+entryId], updatedAt'
    })
    this.version(8).stores({
      logbooks: 'id, encryptedTitle, updatedAt, isSynced, isShared, isDemo',
      yachts: 'logbookId, updatedAt',
      crews: 'payloadId, logbookId, updatedAt',
      deviations: 'logbookId, updatedAt',
      entries: 'payloadId, logbookId, updatedAt',
      syncQueue: '++id, action, type, payloadId, logbookId',
      photos: 'payloadId, entryId, logbookId, updatedAt',
      gpsTracks: 'entryId, logbookId, updatedAt',
      nmeaArchives: 'entryId, logbookId, updatedAt',
      logbookKeys: 'logbookId',
      personPool: 'payloadId, updatedAt',
      logbookCrewSelections: 'logbookId, updatedAt',
      userSyncQueue: '++id, action, type, payloadId',
      entryDrafts: '[logbookId+entryId], updatedAt'
    })
  }
}

export const db = new DaagboxDatabase()
