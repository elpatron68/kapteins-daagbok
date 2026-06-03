import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import {
  decryptJson,
  encryptBuffer,
  decryptBuffer
} from './crypto.js'
import { decryptLogbookTitle, deleteLocalLogbookCache } from './logbook.js'
import { ensureLogbookKey, getLogbookKey, saveLogbookKey } from './logbookKeys.js'
import { syncLogbook } from './sync.js'
import type { SyncQueueItem } from './db.js'
import { getAppVersion } from './pwaVersion.js'
import { dexieFieldsFromEncBytes, encBytesFromDexieFields } from './logbookBackup/encBlob.js'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupManifestCounts,
  type BackupManifestV2,
  type LogbookMetaJson
} from './logbookBackup/manifest.js'
import {
  buildArchiveFromCollected,
  collectLogbookBackupData,
  type BackupExportProgress
} from './logbookBackup/collector.js'
import {
  isZipArchive,
  readBinaryFile,
  readManifestFromArchive,
  readTextFile,
  unzipArchive
} from './logbookBackup/zipArchive.js'

export { BACKUP_FORMAT, BACKUP_VERSION }
export type { BackupExportProgress, BackupManifestCounts, BackupManifestV2 }

export interface LogbookBackupPreview {
  title: string
  exportedAt: string
  sourceLogbookId: string
  counts: BackupManifestCounts
  totalUncompressedBytes: number
}

export interface ParsedLogbookBackup {
  manifest: BackupManifestV2
  files: Record<string, Uint8Array>
}

export interface ExportLogbookBackupOptions {
  onProgress?: (progress: BackupExportProgress) => void
}

const BACKUP_PASSPHRASE_SALT = 'KapteinsDaagbokBackupFileSalt_v1'

async function deriveBackupPassphraseKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passphraseBytes = encoder.encode(passphrase.trim())
  const saltBytes = encoder.encode(BACKUP_PASSPHRASE_SALT)

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100_000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function wrapLogbookKey(logbookKey: ArrayBuffer, passphrase: string) {
  const key = await deriveBackupPassphraseKey(passphrase)
  return encryptBuffer(logbookKey, key)
}

async function unwrapLogbookKeyFromEnc(
  keyEnc: Uint8Array,
  passphrase: string
): Promise<ArrayBuffer> {
  try {
    const fields = dexieFieldsFromEncBytes(keyEnc)
    const cryptoKey = await deriveBackupPassphraseKey(passphrase)
    return decryptBuffer(fields.encryptedData, fields.iv, fields.tag, cryptoKey)
  } catch {
    throw new Error('BACKUP_WRONG_PASSPHRASE')
  }
}

function encryptedPayloadData(
  encryptedData: string,
  iv: string,
  tag: string,
  extra?: Record<string, string>
): string {
  return JSON.stringify({
    ciphertext: encryptedData,
    iv,
    tag,
    ...extra
  })
}

async function queueRestoredLogbookForSync(
  logbookId: string,
  encryptedTitle: string,
  logbookKey: ArrayBuffer,
  manifest: BackupManifestV2,
  files: Record<string, Uint8Array>
): Promise<void> {
  const masterKey = getActiveMasterKey()
  if (!masterKey) throw new Error('Master key not found')

  const aesMasterKey = await window.crypto.subtle.importKey(
    'raw',
    masterKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const encryptedKey = await encryptBuffer(logbookKey, aesMasterKey)
  const now = new Date().toISOString()

  const items: Omit<SyncQueueItem, 'id'>[] = [
    {
      action: 'create',
      type: 'logbook',
      payloadId: logbookId,
      logbookId,
      data: JSON.stringify({
        encryptedTitle,
        encryptedKey: encryptedKey.ciphertext,
        iv: encryptedKey.iv,
        tag: encryptedKey.tag
      }),
      updatedAt: now
    }
  ]

  const readFields = (path: string | null) => {
    if (!path) return null
    return dexieFieldsFromEncBytes(readBinaryFile(files, path))
  }

  const yacht = readFields(manifest.files.yacht)
  if (yacht) {
    items.push({
      action: 'update',
      type: 'yacht',
      payloadId: logbookId,
      logbookId,
      data: encryptedPayloadData(yacht.encryptedData, yacht.iv, yacht.tag),
      updatedAt: now
    })
  }

  const deviation = readFields(manifest.files.deviation)
  if (deviation) {
    items.push({
      action: 'update',
      type: 'deviation',
      payloadId: logbookId,
      logbookId,
      data: encryptedPayloadData(deviation.encryptedData, deviation.iv, deviation.tag),
      updatedAt: now
    })
  }

  const logbookCrew = readFields(manifest.files.logbookCrewSelection)
  if (logbookCrew) {
    items.push({
      action: 'update',
      type: 'logbookCrew',
      payloadId: logbookId,
      logbookId,
      data: encryptedPayloadData(logbookCrew.encryptedData, logbookCrew.iv, logbookCrew.tag),
      updatedAt: now
    })
  }

  const logbookVessel = readFields(manifest.files.logbookVesselSelection)
  if (logbookVessel) {
    items.push({
      action: 'update',
      type: 'logbookVessel',
      payloadId: logbookId,
      logbookId,
      data: encryptedPayloadData(
        logbookVessel.encryptedData,
        logbookVessel.iv,
        logbookVessel.tag
      ),
      updatedAt: now
    })
  }

  for (const crew of manifest.files.crews) {
    const f = readFields(crew.path)
    items.push({
      action: 'create',
      type: 'crew',
      payloadId: crew.payloadId,
      logbookId,
      data: encryptedPayloadData(f!.encryptedData, f!.iv, f!.tag),
      updatedAt: crew.updatedAt
    })
  }

  for (const entry of manifest.files.entries) {
    const f = readFields(entry.path)
    items.push({
      action: 'create',
      type: 'entry',
      payloadId: entry.payloadId,
      logbookId,
      data: encryptedPayloadData(f!.encryptedData, f!.iv, f!.tag),
      updatedAt: entry.updatedAt
    })
  }

  for (const photo of manifest.files.photos) {
    const f = readFields(photo.path)
    items.push({
      action: 'create',
      type: 'photo',
      payloadId: photo.payloadId,
      logbookId,
      data: encryptedPayloadData(f!.encryptedData, f!.iv, f!.tag, {
        entryId: photo.entryId
      }),
      updatedAt: photo.updatedAt
    })
  }

  for (const voice of manifest.files.voiceMemos) {
    const f = readFields(voice.path)
    items.push({
      action: 'create',
      type: 'voiceMemo',
      payloadId: voice.payloadId,
      logbookId,
      data: encryptedPayloadData(f!.encryptedData, f!.iv, f!.tag, {
        entryId: voice.entryId
      }),
      updatedAt: voice.updatedAt
    })
  }

  for (const track of manifest.files.gpsTracks) {
    const f = readFields(track.path)
    items.push({
      action: 'create',
      type: 'gpsTrack',
      payloadId: track.entryId,
      logbookId,
      data: encryptedPayloadData(f!.encryptedData, f!.iv, f!.tag),
      updatedAt: track.updatedAt
    })
  }

  await db.syncQueue.bulkPut(items)
}

async function writeBackupToDexie(
  logbookId: string,
  logbookMeta: LogbookMetaJson,
  logbookKey: ArrayBuffer,
  manifest: BackupManifestV2,
  files: Record<string, Uint8Array>
): Promise<void> {
  await db.logbooks.put({
    id: logbookId,
    encryptedTitle: logbookMeta.encryptedTitle,
    updatedAt: logbookMeta.updatedAt,
    isSynced: 0,
    isShared: 0,
    isDemo: logbookMeta.isDemo ? 1 : 0
  })

  await saveLogbookKey(logbookId, logbookKey)

  const readFields = (path: string | null) => {
    if (!path) return null
    return dexieFieldsFromEncBytes(readBinaryFile(files, path))
  }

  const yacht = readFields(manifest.files.yacht)
  if (yacht) {
    await db.yachts.put({
      logbookId,
      encryptedData: yacht.encryptedData,
      iv: yacht.iv,
      tag: yacht.tag,
      updatedAt: logbookMeta.updatedAt
    })
  }

  const deviation = readFields(manifest.files.deviation)
  if (deviation) {
    await db.deviations.put({
      logbookId,
      encryptedData: deviation.encryptedData,
      iv: deviation.iv,
      tag: deviation.tag,
      updatedAt: logbookMeta.updatedAt
    })
  }

  const logbookCrew = readFields(manifest.files.logbookCrewSelection)
  if (logbookCrew) {
    await db.logbookCrewSelections.put({
      logbookId,
      encryptedData: logbookCrew.encryptedData,
      iv: logbookCrew.iv,
      tag: logbookCrew.tag,
      updatedAt: logbookMeta.updatedAt
    })
  }

  const logbookVessel = readFields(manifest.files.logbookVesselSelection)
  if (logbookVessel) {
    await db.logbookVesselSelections.put({
      logbookId,
      encryptedData: logbookVessel.encryptedData,
      iv: logbookVessel.iv,
      tag: logbookVessel.tag,
      updatedAt: logbookMeta.updatedAt
    })
  }

  if (manifest.files.crews.length > 0) {
    await db.crews.bulkPut(
      manifest.files.crews.map((c) => {
        const f = dexieFieldsFromEncBytes(readBinaryFile(files, c.path))
        return {
          payloadId: c.payloadId,
          logbookId,
          encryptedData: f.encryptedData,
          iv: f.iv,
          tag: f.tag,
          updatedAt: c.updatedAt
        }
      })
    )
  }

  if (manifest.files.entries.length > 0) {
    await db.entries.bulkPut(
      manifest.files.entries.map((e) => {
        const f = dexieFieldsFromEncBytes(readBinaryFile(files, e.path))
        return {
          payloadId: e.payloadId,
          logbookId,
          encryptedData: f.encryptedData,
          iv: f.iv,
          tag: f.tag,
          updatedAt: e.updatedAt
        }
      })
    )
  }

  if (manifest.files.photos.length > 0) {
    await db.photos.bulkPut(
      manifest.files.photos.map((p) => {
        const f = dexieFieldsFromEncBytes(readBinaryFile(files, p.path))
        return {
          payloadId: p.payloadId,
          entryId: p.entryId,
          logbookId,
          encryptedData: f.encryptedData,
          iv: f.iv,
          tag: f.tag,
          caption: '',
          updatedAt: p.updatedAt
        }
      })
    )
  }

  if (manifest.files.voiceMemos.length > 0) {
    await db.voiceMemos.bulkPut(
      manifest.files.voiceMemos.map((v) => {
        const f = dexieFieldsFromEncBytes(readBinaryFile(files, v.path))
        return {
          payloadId: v.payloadId,
          entryId: v.entryId,
          logbookId,
          encryptedData: f.encryptedData,
          iv: f.iv,
          tag: f.tag,
          updatedAt: v.updatedAt
        }
      })
    )
  }

  if (manifest.files.gpsTracks.length > 0) {
    await db.gpsTracks.bulkPut(
      manifest.files.gpsTracks.map((t) => {
        const f = dexieFieldsFromEncBytes(readBinaryFile(files, t.path))
        return {
          entryId: t.entryId,
          logbookId,
          encryptedData: f.encryptedData,
          iv: f.iv,
          tag: f.tag,
          updatedAt: t.updatedAt
        }
      })
    )
  }

  if (manifest.files.nmeaArchives.length > 0) {
    await db.nmeaArchives.bulkPut(
      manifest.files.nmeaArchives.map((n) => {
        const f = dexieFieldsFromEncBytes(readBinaryFile(files, n.path))
        return {
          entryId: n.entryId,
          logbookId,
          encryptedData: f.encryptedData,
          iv: f.iv,
          tag: f.tag,
          updatedAt: n.updatedAt
        }
      })
    )
  }
}

function remapParsedBackup(
  parsed: ParsedLogbookBackup,
  newLogbookId: string
): ParsedLogbookBackup {
  const logbookMeta = JSON.parse(readTextFile(parsed.files, parsed.manifest.files.logbook)) as LogbookMetaJson
  logbookMeta.id = newLogbookId
  const newFiles = { ...parsed.files }
  newFiles[parsed.manifest.files.logbook] = new TextEncoder().encode(JSON.stringify(logbookMeta))
  return {
    manifest: { ...parsed.manifest, logbookId: newLogbookId },
    files: newFiles
  }
}

export async function exportLogbookBackup(
  logbookId: string,
  passphrase: string,
  options: ExportLogbookBackupOptions = {}
): Promise<{ blob: Blob; filename: string; manifest: BackupManifestV2 }> {
  if (!passphrase.trim() || passphrase.length < 8) {
    throw new Error('BACKUP_PASSPHRASE_TOO_SHORT')
  }

  const logbook = await db.logbooks.get(logbookId)
  if (!logbook || logbook.isShared === 1) {
    throw new Error('BACKUP_NOT_OWNER')
  }

  if (navigator.onLine) {
    await syncLogbook(logbookId).catch((err) => {
      console.warn('Pre-backup sync failed, exporting local data:', err)
    })
  }

  options.onProgress?.({ phase: 'collect', current: 0, total: 1, bytesPacked: 0 })
  const collected = await collectLogbookBackupData(logbookId)
  const logbookKey = (await getLogbookKey(logbookId)) ?? (await ensureLogbookKey(logbookId))
  const wrapped = await wrapLogbookKey(logbookKey, passphrase)
  const keyEnc = encBytesFromDexieFields({
    encryptedData: wrapped.ciphertext,
    iv: wrapped.iv,
    tag: wrapped.tag
  })

  const { zipBytes, manifest } = buildArchiveFromCollected(collected, keyEnc, {
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    onProgress: options.onProgress
  })

  const title = await decryptLogbookTitle(logbookId, logbook.encryptedTitle)
  const safeTitle = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'logbook'
  const datePart = new Date().toISOString().slice(0, 10)
  const filename = `${safeTitle}-${datePart}.daagbok`
  const blob = new Blob([zipBytes.slice()], { type: 'application/zip' })

  return { blob, filename, manifest }
}

function detectLegacyJsonV1(text: string): boolean {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('{')) return false
  try {
    const parsed = JSON.parse(trimmed) as { format?: string; version?: number }
    return parsed.format === BACKUP_FORMAT && parsed.version === 1
  } catch {
    return false
  }
}

export async function parseLogbookBackupFile(file: File): Promise<ParsedLogbookBackup> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  if (!isZipArchive(bytes)) {
    const text = new TextDecoder().decode(bytes)
    if (detectLegacyJsonV1(text)) {
      throw new Error('BACKUP_VERSION_UNSUPPORTED')
    }
    throw new Error('BACKUP_INVALID_ARCHIVE')
  }

  const files = unzipArchive(bytes)
  const manifest = readManifestFromArchive(files)
  return { manifest, files }
}

export async function previewLogbookBackup(
  backup: ParsedLogbookBackup,
  passphrase: string
): Promise<LogbookBackupPreview> {
  const logbookKey = await unwrapLogbookKeyFromEnc(
    readBinaryFile(backup.files, backup.manifest.files.key),
    passphrase
  )
  const logbookMeta = JSON.parse(
    readTextFile(backup.files, backup.manifest.files.logbook)
  ) as LogbookMetaJson
  const parsed = JSON.parse(logbookMeta.encryptedTitle)
  let title: string
  try {
    title = await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, logbookKey)
  } catch {
    throw new Error('BACKUP_WRONG_PASSPHRASE')
  }

  return {
    title,
    exportedAt: backup.manifest.exportedAt,
    sourceLogbookId: backup.manifest.logbookId,
    counts: backup.manifest.counts,
    totalUncompressedBytes: backup.manifest.totalUncompressedBytes
  }
}

export interface RestoreLogbookOptions {
  overwrite?: boolean
  assignNewId?: boolean
}

export async function restoreLogbookBackup(
  backup: ParsedLogbookBackup,
  passphrase: string,
  options: RestoreLogbookOptions = {}
): Promise<{ logbookId: string; title: string }> {
  if (!getActiveMasterKey()) {
    throw new Error('BACKUP_NOT_AUTHENTICATED')
  }

  const logbookKey = await unwrapLogbookKeyFromEnc(
    readBinaryFile(backup.files, backup.manifest.files.key),
    passphrase
  )
  const logbookMeta = JSON.parse(
    readTextFile(backup.files, backup.manifest.files.logbook)
  ) as LogbookMetaJson
  const parsedTitle = JSON.parse(logbookMeta.encryptedTitle)
  let title: string
  try {
    title = await decryptJson(parsedTitle.ciphertext, parsedTitle.iv, parsedTitle.tag, logbookKey)
  } catch {
    throw new Error('BACKUP_WRONG_PASSPHRASE')
  }

  let targetId = backup.manifest.logbookId
  const existing = await db.logbooks.get(targetId)

  if (existing && !options.overwrite && !options.assignNewId) {
    throw new Error('BACKUP_ID_CONFLICT')
  }

  if (existing && options.overwrite) {
    await deleteLocalLogbookCache(targetId)
  }

  let prepared = backup
  if (options.assignNewId || (existing && !options.overwrite)) {
    targetId = crypto.randomUUID()
    prepared = remapParsedBackup(backup, targetId)
  }

  const finalMeta = JSON.parse(
    readTextFile(prepared.files, prepared.manifest.files.logbook)
  ) as LogbookMetaJson

  await writeBackupToDexie(
    targetId,
    finalMeta,
    logbookKey,
    prepared.manifest,
    prepared.files
  )
  await queueRestoredLogbookForSync(
    targetId,
    finalMeta.encryptedTitle,
    logbookKey,
    prepared.manifest,
    prepared.files
  )

  if (navigator.onLine) {
    await syncLogbook(targetId).catch((err) => {
      console.warn('Post-restore sync failed, data saved locally:', err)
    })
  }

  return { logbookId: targetId, title }
}

export function downloadBackupBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Human-readable size for UI warnings. */
export function formatBackupBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const BACKUP_SIZE_WARN_BYTES = 50_000_000
export const BACKUP_SIZE_CONFIRM_BYTES = 150_000_000
