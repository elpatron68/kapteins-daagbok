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

export const BACKUP_FORMAT = 'kapteins-daagbok-backup' as const
export const BACKUP_VERSION = 1 as const

export interface LogbookBackupFile {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  logbook: {
    id: string
    encryptedTitle: string
    updatedAt: string
    isDemo?: boolean
  }
  logbookKey: {
    ciphertext: string
    iv: string
    tag: string
  }
  payloads: {
    yacht: {
      encryptedData: string
      iv: string
      tag: string
      updatedAt: string
    } | null
    deviation: {
      encryptedData: string
      iv: string
      tag: string
      updatedAt: string
    } | null
    crews: Array<{
      payloadId: string
      encryptedData: string
      iv: string
      tag: string
      updatedAt: string
    }>
    entries: Array<{
      payloadId: string
      encryptedData: string
      iv: string
      tag: string
      updatedAt: string
    }>
    photos: Array<{
      payloadId: string
      entryId: string
      encryptedData: string
      iv: string
      tag: string
      updatedAt: string
    }>
    voiceMemos: Array<{
      payloadId: string
      entryId: string
      encryptedData: string
      iv: string
      tag: string
      updatedAt: string
    }>
    gpsTracks: Array<{
      entryId: string
      encryptedData: string
      iv: string
      tag: string
      updatedAt: string
    }>
  }
  counts: {
    entries: number
    photos: number
    voiceMemos: number
    crews: number
    gpsTracks: number
    hasYacht: boolean
    hasDeviation: boolean
  }
}

export interface LogbookBackupPreview {
  title: string
  exportedAt: string
  sourceLogbookId: string
  counts: LogbookBackupFile['counts']
}

async function deriveBackupPassphraseKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passphraseBytes = encoder.encode(passphrase.trim())
  const saltBytes = encoder.encode('KapteinsDaagbokBackupFileSalt_v1')

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

async function unwrapLogbookKey(
  wrapped: LogbookBackupFile['logbookKey'],
  passphrase: string
): Promise<ArrayBuffer> {
  const key = await deriveBackupPassphraseKey(passphrase)
  return decryptBuffer(wrapped.ciphertext, wrapped.iv, wrapped.tag, key)
}

function normalizeBackupPayloads(
  payloads: LogbookBackupFile['payloads']
): LogbookBackupFile['payloads'] {
  return {
    ...payloads,
    voiceMemos: payloads.voiceMemos ?? []
  }
}

function isBackupFile(value: unknown): value is LogbookBackupFile {
  if (!value || typeof value !== 'object') return false
  const obj = value as Partial<LogbookBackupFile>
  return (
    obj.format === BACKUP_FORMAT &&
    obj.version === BACKUP_VERSION &&
    typeof obj.exportedAt === 'string' &&
    !!obj.logbook?.id &&
    !!obj.logbook?.encryptedTitle &&
    !!obj.logbookKey?.ciphertext &&
    !!obj.payloads
  )
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

async function collectLogbookPayloads(logbookId: string): Promise<LogbookBackupFile['payloads']> {
  const [yacht, deviation, crews, entries, photos, voiceMemos, gpsTracks] = await Promise.all([
    db.yachts.get(logbookId),
    db.deviations.get(logbookId),
    db.crews.where({ logbookId }).toArray(),
    db.entries.where({ logbookId }).toArray(),
    db.photos.where({ logbookId }).toArray(),
    db.voiceMemos.where({ logbookId }).toArray(),
    db.gpsTracks.where({ logbookId }).toArray()
  ])

  return {
    yacht: yacht
      ? {
          encryptedData: yacht.encryptedData,
          iv: yacht.iv,
          tag: yacht.tag,
          updatedAt: yacht.updatedAt
        }
      : null,
    deviation: deviation
      ? {
          encryptedData: deviation.encryptedData,
          iv: deviation.iv,
          tag: deviation.tag,
          updatedAt: deviation.updatedAt
        }
      : null,
    crews: crews.map((c) => ({
      payloadId: c.payloadId,
      encryptedData: c.encryptedData,
      iv: c.iv,
      tag: c.tag,
      updatedAt: c.updatedAt
    })),
    entries: entries.map((e) => ({
      payloadId: e.payloadId,
      encryptedData: e.encryptedData,
      iv: e.iv,
      tag: e.tag,
      updatedAt: e.updatedAt
    })),
    photos: photos.map((p) => ({
      payloadId: p.payloadId,
      entryId: p.entryId,
      encryptedData: p.encryptedData,
      iv: p.iv,
      tag: p.tag,
      updatedAt: p.updatedAt
    })),
    voiceMemos: voiceMemos.map((v) => ({
      payloadId: v.payloadId,
      entryId: v.entryId,
      encryptedData: v.encryptedData,
      iv: v.iv,
      tag: v.tag,
      updatedAt: v.updatedAt
    })),
    gpsTracks: gpsTracks.map((t) => ({
      entryId: t.entryId,
      encryptedData: t.encryptedData,
      iv: t.iv,
      tag: t.tag,
      updatedAt: t.updatedAt
    }))
  }
}

function remapBackup(
  backup: LogbookBackupFile,
  newLogbookId: string
): LogbookBackupFile {
  return {
    ...backup,
    logbook: {
      ...backup.logbook,
      id: newLogbookId
    },
    payloads: {
      ...backup.payloads,
      yacht: backup.payloads.yacht
        ? { ...backup.payloads.yacht, updatedAt: backup.payloads.yacht.updatedAt }
        : null,
      deviation: backup.payloads.deviation
        ? { ...backup.payloads.deviation, updatedAt: backup.payloads.deviation.updatedAt }
        : null,
      crews: backup.payloads.crews.map((c) => ({ ...c })),
      entries: backup.payloads.entries.map((e) => ({ ...e })),
      photos: backup.payloads.photos.map((p) => ({ ...p })),
      voiceMemos: (backup.payloads.voiceMemos ?? []).map((v) => ({ ...v })),
      gpsTracks: backup.payloads.gpsTracks.map((t) => ({ ...t }))
    }
  }
}

async function queueRestoredLogbookForSync(
  logbookId: string,
  encryptedTitle: string,
  logbookKey: ArrayBuffer,
  payloads: LogbookBackupFile['payloads']
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

  if (payloads.yacht) {
    items.push({
      action: 'update',
      type: 'yacht',
      payloadId: logbookId,
      logbookId,
      data: encryptedPayloadData(
        payloads.yacht.encryptedData,
        payloads.yacht.iv,
        payloads.yacht.tag
      ),
      updatedAt: payloads.yacht.updatedAt
    })
  }

  if (payloads.deviation) {
    items.push({
      action: 'update',
      type: 'deviation',
      payloadId: logbookId,
      logbookId,
      data: encryptedPayloadData(
        payloads.deviation.encryptedData,
        payloads.deviation.iv,
        payloads.deviation.tag
      ),
      updatedAt: payloads.deviation.updatedAt
    })
  }

  for (const crew of payloads.crews) {
    items.push({
      action: 'create',
      type: 'crew',
      payloadId: crew.payloadId,
      logbookId,
      data: encryptedPayloadData(crew.encryptedData, crew.iv, crew.tag),
      updatedAt: crew.updatedAt
    })
  }

  for (const entry of payloads.entries) {
    items.push({
      action: 'create',
      type: 'entry',
      payloadId: entry.payloadId,
      logbookId,
      data: encryptedPayloadData(entry.encryptedData, entry.iv, entry.tag),
      updatedAt: entry.updatedAt
    })
  }

  for (const photo of payloads.photos) {
    items.push({
      action: 'create',
      type: 'photo',
      payloadId: photo.payloadId,
      logbookId,
      data: encryptedPayloadData(photo.encryptedData, photo.iv, photo.tag, {
        entryId: photo.entryId
      }),
      updatedAt: photo.updatedAt
    })
  }

  for (const voice of payloads.voiceMemos ?? []) {
    items.push({
      action: 'create',
      type: 'voiceMemo',
      payloadId: voice.payloadId,
      logbookId,
      data: encryptedPayloadData(voice.encryptedData, voice.iv, voice.tag, {
        entryId: voice.entryId
      }),
      updatedAt: voice.updatedAt
    })
  }

  for (const track of payloads.gpsTracks) {
    items.push({
      action: 'create',
      type: 'gpsTrack',
      payloadId: track.entryId,
      logbookId,
      data: encryptedPayloadData(track.encryptedData, track.iv, track.tag),
      updatedAt: track.updatedAt
    })
  }

  await db.syncQueue.bulkPut(items)
}

async function writeBackupToDexie(
  logbookId: string,
  backup: LogbookBackupFile,
  logbookKey: ArrayBuffer
): Promise<void> {
  const { logbook, payloads } = backup

  await db.logbooks.put({
    id: logbookId,
    encryptedTitle: logbook.encryptedTitle,
    updatedAt: logbook.updatedAt,
    isSynced: 0,
    isShared: 0,
    isDemo: logbook.isDemo ? 1 : 0
  })

  await saveLogbookKey(logbookId, logbookKey)

  if (payloads.yacht) {
    await db.yachts.put({
      logbookId,
      encryptedData: payloads.yacht.encryptedData,
      iv: payloads.yacht.iv,
      tag: payloads.yacht.tag,
      updatedAt: payloads.yacht.updatedAt
    })
  }

  if (payloads.deviation) {
    await db.deviations.put({
      logbookId,
      encryptedData: payloads.deviation.encryptedData,
      iv: payloads.deviation.iv,
      tag: payloads.deviation.tag,
      updatedAt: payloads.deviation.updatedAt
    })
  }

  if (payloads.crews.length > 0) {
    await db.crews.bulkPut(
      payloads.crews.map((c) => ({
        payloadId: c.payloadId,
        logbookId,
        encryptedData: c.encryptedData,
        iv: c.iv,
        tag: c.tag,
        updatedAt: c.updatedAt
      }))
    )
  }

  if (payloads.entries.length > 0) {
    await db.entries.bulkPut(
      payloads.entries.map((e) => ({
        payloadId: e.payloadId,
        logbookId,
        encryptedData: e.encryptedData,
        iv: e.iv,
        tag: e.tag,
        updatedAt: e.updatedAt
      }))
    )
  }

  if (payloads.photos.length > 0) {
    await db.photos.bulkPut(
      payloads.photos.map((p) => ({
        payloadId: p.payloadId,
        entryId: p.entryId,
        logbookId,
        encryptedData: p.encryptedData,
        iv: p.iv,
        tag: p.tag,
        caption: '',
        updatedAt: p.updatedAt
      }))
    )
  }

  const voiceMemosToRestore = payloads.voiceMemos ?? []
  if (voiceMemosToRestore.length > 0) {
    await db.voiceMemos.bulkPut(
      voiceMemosToRestore.map((v) => ({
        payloadId: v.payloadId,
        entryId: v.entryId,
        logbookId,
        encryptedData: v.encryptedData,
        iv: v.iv,
        tag: v.tag,
        updatedAt: v.updatedAt
      }))
    )
  }

  if (payloads.gpsTracks.length > 0) {
    await db.gpsTracks.bulkPut(
      payloads.gpsTracks.map((t) => ({
        entryId: t.entryId,
        logbookId,
        encryptedData: t.encryptedData,
        iv: t.iv,
        tag: t.tag,
        updatedAt: t.updatedAt
      }))
    )
  }
}

export async function exportLogbookBackup(
  logbookId: string,
  passphrase: string
): Promise<{ blob: Blob; filename: string; backup: LogbookBackupFile }> {
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

  const logbookKey = (await getLogbookKey(logbookId)) ?? (await ensureLogbookKey(logbookId))
  const payloads = await collectLogbookPayloads(logbookId)
  const wrappedKey = await wrapLogbookKey(logbookKey, passphrase)

  const backup: LogbookBackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    logbook: {
      id: logbook.id,
      encryptedTitle: logbook.encryptedTitle,
      updatedAt: logbook.updatedAt,
      isDemo: logbook.isDemo === 1
    },
    logbookKey: wrappedKey,
    payloads,
    counts: {
      entries: payloads.entries.length,
      photos: payloads.photos.length,
      voiceMemos: payloads.voiceMemos?.length ?? 0,
      crews: payloads.crews.length,
      gpsTracks: payloads.gpsTracks.length,
      hasYacht: !!payloads.yacht,
      hasDeviation: !!payloads.deviation
    }
  }

  const title = await decryptLogbookTitle(logbookId, logbook.encryptedTitle)
  const safeTitle = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'logbook'
  const datePart = new Date().toISOString().slice(0, 10)
  const filename = `${safeTitle}-${datePart}.daagbok.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })

  return { blob, filename, backup }
}

export async function parseLogbookBackupFile(file: File): Promise<LogbookBackupFile> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('BACKUP_INVALID_JSON')
  }

  if (!isBackupFile(parsed)) {
    throw new Error('BACKUP_INVALID_FORMAT')
  }

  return {
    ...parsed,
    payloads: normalizeBackupPayloads(parsed.payloads),
    counts: {
      ...parsed.counts,
      voiceMemos: parsed.counts.voiceMemos ?? parsed.payloads.voiceMemos?.length ?? 0
    }
  }
}

export async function previewLogbookBackup(
  backup: LogbookBackupFile,
  passphrase: string
): Promise<LogbookBackupPreview> {
  const logbookKey = await unwrapLogbookKey(backup.logbookKey, passphrase)
  const parsed = JSON.parse(backup.logbook.encryptedTitle)
  const title = await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, logbookKey)

  return {
    title,
    exportedAt: backup.exportedAt,
    sourceLogbookId: backup.logbook.id,
    counts: backup.counts
  }
}

export interface RestoreLogbookOptions {
  overwrite?: boolean
  assignNewId?: boolean
}

export async function restoreLogbookBackup(
  backup: LogbookBackupFile,
  passphrase: string,
  options: RestoreLogbookOptions = {}
): Promise<{ logbookId: string; title: string }> {
  if (!getActiveMasterKey()) {
    throw new Error('BACKUP_NOT_AUTHENTICATED')
  }

  const logbookKey = await unwrapLogbookKey(backup.logbookKey, passphrase)
  const parsedTitle = JSON.parse(backup.logbook.encryptedTitle)
  const title = await decryptJson(
    parsedTitle.ciphertext,
    parsedTitle.iv,
    parsedTitle.tag,
    logbookKey
  )

  let targetId = backup.logbook.id
  const existing = await db.logbooks.get(targetId)

  if (existing && !options.overwrite && !options.assignNewId) {
    throw new Error('BACKUP_ID_CONFLICT')
  }

  if (existing && options.overwrite) {
    await deleteLocalLogbookCache(targetId)
  }

  if (options.assignNewId || (existing && !options.overwrite)) {
    targetId = crypto.randomUUID()
  }

  const normalized = {
    ...backup,
    payloads: normalizeBackupPayloads(backup.payloads)
  }
  const prepared = targetId === normalized.logbook.id
    ? normalized
    : remapBackup(normalized, targetId)

  await writeBackupToDexie(targetId, prepared, logbookKey)
  await queueRestoredLogbookForSync(
    targetId,
    prepared.logbook.encryptedTitle,
    logbookKey,
    prepared.payloads
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
