export const BACKUP_FORMAT = 'kapteins-daagbok-backup' as const
export const BACKUP_VERSION = 2 as const

export interface BackupIndexedFile {
  path: string
  updatedAt: string
  bytes: number
}

export interface BackupIndexedPayloadFile extends BackupIndexedFile {
  payloadId: string
}

export interface BackupIndexedEntryFile extends BackupIndexedPayloadFile {
  entryId: string
}

export interface BackupIndexedTrackFile extends BackupIndexedFile {
  entryId: string
}

export interface BackupManifestCounts {
  entries: number
  photos: number
  voiceMemos: number
  crews: number
  gpsTracks: number
  nmeaArchives: number
  hasYacht: boolean
  hasDeviation: boolean
  hasLogbookCrewSelection: boolean
  hasLogbookVesselSelection: boolean
}

export interface BackupManifestFiles {
  key: string
  logbook: string
  yacht: string | null
  deviation: string | null
  logbookCrewSelection: string | null
  logbookVesselSelection: string | null
  crews: BackupIndexedPayloadFile[]
  entries: BackupIndexedPayloadFile[]
  photos: BackupIndexedEntryFile[]
  voiceMemos: BackupIndexedEntryFile[]
  gpsTracks: BackupIndexedTrackFile[]
  nmeaArchives: BackupIndexedTrackFile[]
}

export interface BackupManifestV2 {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  appVersion?: string
  compression: 'zip-deflate-6'
  logbookId: string
  counts: BackupManifestCounts
  totalUncompressedBytes: number
  files: BackupManifestFiles
}

export interface LogbookMetaJson {
  id: string
  encryptedTitle: string
  updatedAt: string
  isDemo?: boolean
}

export function parseManifestJson(text: string): BackupManifestV2 {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('BACKUP_INVALID_FORMAT')
  }
  if (!isBackupManifestV2(parsed)) {
    throw new Error('BACKUP_INVALID_FORMAT')
  }
  return parsed
}

export function isBackupManifestV2(value: unknown): value is BackupManifestV2 {
  if (!value || typeof value !== 'object') return false
  const obj = value as Partial<BackupManifestV2>
  return (
    obj.format === BACKUP_FORMAT &&
    obj.version === BACKUP_VERSION &&
    typeof obj.exportedAt === 'string' &&
    typeof obj.logbookId === 'string' &&
    !!obj.counts &&
    !!obj.files
  )
}

export function serializeManifest(manifest: BackupManifestV2): string {
  return JSON.stringify(manifest)
}
