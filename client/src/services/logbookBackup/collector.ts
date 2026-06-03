import { db } from '../db.js'
import { encBytesFromDexieFields, type DexieEncFields } from './encBlob.js'
import { buildZipArchive, utf8Bytes } from './zipArchive.js'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupIndexedEntryFile,
  type BackupIndexedPayloadFile,
  type BackupIndexedTrackFile,
  type BackupManifestCounts,
  type BackupManifestFiles,
  type BackupManifestV2,
  type LogbookMetaJson
} from './manifest.js'

export interface CollectedBackupData {
  logbookMeta: LogbookMetaJson
  yacht: DexieEncFields | null
  deviation: DexieEncFields | null
  logbookCrewSelection: DexieEncFields | null
  logbookVesselSelection: DexieEncFields | null
  crews: Array<DexieEncFields & { payloadId: string; updatedAt: string }>
  entries: Array<DexieEncFields & { payloadId: string; updatedAt: string }>
  photos: Array<DexieEncFields & { payloadId: string; entryId: string; updatedAt: string }>
  voiceMemos: Array<DexieEncFields & { payloadId: string; entryId: string; updatedAt: string }>
  gpsTracks: Array<DexieEncFields & { entryId: string; updatedAt: string }>
  nmeaArchives: Array<DexieEncFields & { entryId: string; updatedAt: string }>
}

function pickEnc(row: {
  encryptedData: string
  iv: string
  tag: string
}): DexieEncFields {
  return {
    encryptedData: row.encryptedData,
    iv: row.iv,
    tag: row.tag
  }
}

export async function collectLogbookBackupData(
  logbookId: string
): Promise<CollectedBackupData> {
  const [
    logbook,
    yacht,
    deviation,
    logbookCrewSelection,
    logbookVesselSelection,
    crews,
    entries,
    photos,
    voiceMemos,
    gpsTracks,
    nmeaArchives
  ] = await Promise.all([
    db.logbooks.get(logbookId),
    db.yachts.get(logbookId),
    db.deviations.get(logbookId),
    db.logbookCrewSelections.get(logbookId),
    db.logbookVesselSelections.get(logbookId),
    db.crews.where({ logbookId }).toArray(),
    db.entries.where({ logbookId }).toArray(),
    db.photos.where({ logbookId }).toArray(),
    db.voiceMemos.where({ logbookId }).toArray(),
    db.gpsTracks.where({ logbookId }).toArray(),
    db.nmeaArchives.where({ logbookId }).toArray()
  ])

  if (!logbook) throw new Error('BACKUP_LOGBOOK_NOT_FOUND')

  return {
    logbookMeta: {
      id: logbook.id,
      encryptedTitle: logbook.encryptedTitle,
      updatedAt: logbook.updatedAt,
      isDemo: logbook.isDemo === 1
    },
    yacht: yacht ? pickEnc(yacht) : null,
    deviation: deviation ? pickEnc(deviation) : null,
    logbookCrewSelection: logbookCrewSelection ? pickEnc(logbookCrewSelection) : null,
    logbookVesselSelection: logbookVesselSelection ? pickEnc(logbookVesselSelection) : null,
    crews: crews.map((c) => ({ ...pickEnc(c), payloadId: c.payloadId, updatedAt: c.updatedAt })),
    entries: entries.map((e) => ({
      ...pickEnc(e),
      payloadId: e.payloadId,
      updatedAt: e.updatedAt
    })),
    photos: photos.map((p) => ({
      ...pickEnc(p),
      payloadId: p.payloadId,
      entryId: p.entryId,
      updatedAt: p.updatedAt
    })),
    voiceMemos: voiceMemos.map((v) => ({
      ...pickEnc(v),
      payloadId: v.payloadId,
      entryId: v.entryId,
      updatedAt: v.updatedAt
    })),
    gpsTracks: gpsTracks.map((t) => ({
      ...pickEnc(t),
      entryId: t.entryId,
      updatedAt: t.updatedAt
    })),
    nmeaArchives: nmeaArchives.map((n) => ({
      ...pickEnc(n),
      entryId: n.entryId,
      updatedAt: n.updatedAt
    }))
  }
}

export type BackupProgressPhase = 'collect' | 'pack' | 'done'

export interface BackupExportProgress {
  phase: BackupProgressPhase
  current: number
  total: number
  bytesPacked: number
}

export interface BuiltArchive {
  zipBytes: Uint8Array
  manifest: BackupManifestV2
  counts: BackupManifestCounts
  totalUncompressedBytes: number
}

function addEncFile(
  zipFiles: Record<string, Uint8Array>,
  path: string,
  fields: DexieEncFields
): number {
  const bytes = encBytesFromDexieFields(fields)
  zipFiles[path] = bytes
  return bytes.byteLength
}

export function buildArchiveFromCollected(
  collected: CollectedBackupData,
  keyEnc: Uint8Array,
  options: {
    exportedAt: string
    appVersion?: string
    onProgress?: (progress: BackupExportProgress) => void
  }
): BuiltArchive {
  const zipFiles: Record<string, Uint8Array> = {}
  let totalUncompressedBytes = 0

  const logbookPath = 'logbook.meta.json'
  zipFiles[logbookPath] = utf8Bytes(JSON.stringify(collected.logbookMeta))
  totalUncompressedBytes += zipFiles[logbookPath].byteLength

  zipFiles['key.enc'] = keyEnc
  totalUncompressedBytes += keyEnc.byteLength

  const files: BackupManifestFiles = {
    key: 'key.enc',
    logbook: logbookPath,
    yacht: null,
    deviation: null,
    logbookCrewSelection: null,
    logbookVesselSelection: null,
    crews: [],
    entries: [],
    photos: [],
    voiceMemos: [],
    gpsTracks: [],
    nmeaArchives: []
  }

  const packSteps: Array<() => void> = []

  if (collected.yacht) {
    packSteps.push(() => {
      const path = 'payloads/yacht.enc'
      const size = addEncFile(zipFiles, path, collected.yacht!)
      files.yacht = path
      totalUncompressedBytes += size
    })
  }

  if (collected.deviation) {
    packSteps.push(() => {
      const path = 'payloads/deviation.enc'
      const size = addEncFile(zipFiles, path, collected.deviation!)
      files.deviation = path
      totalUncompressedBytes += size
    })
  }

  if (collected.logbookCrewSelection) {
    packSteps.push(() => {
      const path = 'payloads/logbook-crew.enc'
      const size = addEncFile(zipFiles, path, collected.logbookCrewSelection!)
      files.logbookCrewSelection = path
      totalUncompressedBytes += size
    })
  }

  if (collected.logbookVesselSelection) {
    packSteps.push(() => {
      const path = 'payloads/logbook-vessel.enc'
      const size = addEncFile(zipFiles, path, collected.logbookVesselSelection!)
      files.logbookVesselSelection = path
      totalUncompressedBytes += size
    })
  }

  for (const c of collected.crews) {
    packSteps.push(() => {
      const path = `payloads/crews/${c.payloadId}.enc`
      const size = addEncFile(zipFiles, path, c)
      const index: BackupIndexedPayloadFile = {
        path,
        payloadId: c.payloadId,
        updatedAt: c.updatedAt,
        bytes: size
      }
      files.crews.push(index)
      totalUncompressedBytes += size
    })
  }

  for (const e of collected.entries) {
    packSteps.push(() => {
      const path = `payloads/entries/${e.payloadId}.enc`
      const size = addEncFile(zipFiles, path, e)
      const index: BackupIndexedPayloadFile = {
        path,
        payloadId: e.payloadId,
        updatedAt: e.updatedAt,
        bytes: size
      }
      files.entries.push(index)
      totalUncompressedBytes += size
    })
  }

  for (const p of collected.photos) {
    packSteps.push(() => {
      const path = `payloads/photos/${p.payloadId}.enc`
      const size = addEncFile(zipFiles, path, p)
      const index: BackupIndexedEntryFile = {
        path,
        payloadId: p.payloadId,
        entryId: p.entryId,
        updatedAt: p.updatedAt,
        bytes: size
      }
      files.photos.push(index)
      totalUncompressedBytes += size
    })
  }

  for (const v of collected.voiceMemos) {
    packSteps.push(() => {
      const path = `payloads/voice-memos/${v.payloadId}.enc`
      const size = addEncFile(zipFiles, path, v)
      const index: BackupIndexedEntryFile = {
        path,
        payloadId: v.payloadId,
        entryId: v.entryId,
        updatedAt: v.updatedAt,
        bytes: size
      }
      files.voiceMemos.push(index)
      totalUncompressedBytes += size
    })
  }

  for (const t of collected.gpsTracks) {
    packSteps.push(() => {
      const path = `payloads/gps-tracks/${t.entryId}.enc`
      const size = addEncFile(zipFiles, path, t)
      const index: BackupIndexedTrackFile = {
        path,
        entryId: t.entryId,
        updatedAt: t.updatedAt,
        bytes: size
      }
      files.gpsTracks.push(index)
      totalUncompressedBytes += size
    })
  }

  for (const n of collected.nmeaArchives) {
    packSteps.push(() => {
      const path = `payloads/nmea-archives/${n.entryId}.enc`
      const size = addEncFile(zipFiles, path, n)
      const index: BackupIndexedTrackFile = {
        path,
        entryId: n.entryId,
        updatedAt: n.updatedAt,
        bytes: size
      }
      files.nmeaArchives.push(index)
      totalUncompressedBytes += size
    })
  }

  const total = packSteps.length
  packSteps.forEach((step, i) => {
    step()
    options.onProgress?.({
      phase: 'pack',
      current: i + 1,
      total,
      bytesPacked: totalUncompressedBytes
    })
  })

  const counts: BackupManifestCounts = {
    entries: collected.entries.length,
    photos: collected.photos.length,
    voiceMemos: collected.voiceMemos.length,
    crews: collected.crews.length,
    gpsTracks: collected.gpsTracks.length,
    nmeaArchives: collected.nmeaArchives.length,
    hasYacht: !!collected.yacht,
    hasDeviation: !!collected.deviation,
    hasLogbookCrewSelection: !!collected.logbookCrewSelection,
    hasLogbookVesselSelection: !!collected.logbookVesselSelection
  }

  const manifest: BackupManifestV2 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: options.exportedAt,
    appVersion: options.appVersion,
    compression: 'zip-deflate-6',
    logbookId: collected.logbookMeta.id,
    counts,
    totalUncompressedBytes,
    files
  }

  zipFiles['manifest.json'] = utf8Bytes(JSON.stringify(manifest))
  totalUncompressedBytes += zipFiles['manifest.json'].byteLength

  const zipBytes = buildZipArchive(zipFiles)
  manifest.totalUncompressedBytes = totalUncompressedBytes

  options.onProgress?.({
    phase: 'done',
    current: total,
    total,
    bytesPacked: totalUncompressedBytes
  })

  return { zipBytes, manifest, counts, totalUncompressedBytes }
}
