import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { encryptJson, decryptJson } from './crypto.js'
import { nmeaFileCrc32 } from '../utils/crc32.js'

export interface NmeaImportedFile {
  crc32: string
  filename: string
  importedAt: string
}

export interface NmeaArchiveRecord {
  filename: string
  rawText: string
  importedAt: string
  importedFiles: NmeaImportedFile[]
}

function normalizeArchiveRecord(raw: Partial<NmeaArchiveRecord>): NmeaArchiveRecord {
  const importedFiles = [...(raw.importedFiles ?? [])]
  if (importedFiles.length === 0 && raw.rawText) {
    importedFiles.push({
      crc32: nmeaFileCrc32(raw.rawText),
      filename: raw.filename ?? '',
      importedAt: raw.importedAt ?? ''
    })
  }
  return {
    filename: raw.filename ?? '',
    rawText: raw.rawText ?? '',
    importedAt: raw.importedAt ?? '',
    importedFiles
  }
}

async function putNmeaArchiveRecord(
  logbookId: string,
  entryId: string,
  payload: NmeaArchiveRecord
): Promise<void> {
  const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
  if (!masterKey) throw new Error('Encryption key not found. Please log in.')

  const encrypted = await encryptJson(payload, masterKey)
  await db.nmeaArchives.put({
    entryId,
    logbookId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: payload.importedAt || new Date().toISOString()
  })
}

export async function getNmeaArchive(entryId: string): Promise<NmeaArchiveRecord | null> {
  const record = await db.nmeaArchives.get(entryId)
  if (!record) return null

  const masterKey = await getLogbookKey(record.logbookId) || getActiveMasterKey()
  if (!masterKey) throw new Error('Encryption key not found. Please log in.')

  try {
    return normalizeArchiveRecord(
      await decryptJson(record.encryptedData, record.iv, record.tag, masterKey) as Partial<NmeaArchiveRecord>
    )
  } catch {
    return null
  }
}

export function isNmeaCrcAlreadyImported(record: NmeaArchiveRecord | null, rawText: string): boolean {
  if (!record) return false
  const crc32 = nmeaFileCrc32(rawText)
  return record.importedFiles.some((file) => file.crc32 === crc32)
}

/** Remember imported file by CRC (even when raw log is discarded). */
export async function recordNmeaFileImport(
  logbookId: string,
  entryId: string,
  filename: string,
  rawText: string
): Promise<string> {
  const crc32 = nmeaFileCrc32(rawText)
  const existing = await getNmeaArchive(entryId)
  const importedFiles = [...(existing?.importedFiles ?? [])]
  if (!importedFiles.some((file) => file.crc32 === crc32)) {
    importedFiles.push({
      crc32,
      filename,
      importedAt: new Date().toISOString()
    })
  }

  const payload: NmeaArchiveRecord = {
    filename: existing?.filename ?? '',
    rawText: existing?.rawText ?? '',
    importedAt: new Date().toISOString(),
    importedFiles
  }
  await putNmeaArchiveRecord(logbookId, entryId, payload)
  return crc32
}

export async function saveNmeaArchive(
  logbookId: string,
  entryId: string,
  filename: string,
  rawText: string
): Promise<void> {
  const crc32 = nmeaFileCrc32(rawText)
  const existing = await getNmeaArchive(entryId)
  const importedFiles = [...(existing?.importedFiles ?? [])]
  if (!importedFiles.some((file) => file.crc32 === crc32)) {
    importedFiles.push({
      crc32,
      filename,
      importedAt: new Date().toISOString()
    })
  }

  const payload: NmeaArchiveRecord = {
    filename,
    rawText,
    importedAt: new Date().toISOString(),
    importedFiles
  }
  await putNmeaArchiveRecord(logbookId, entryId, payload)
}

export async function deleteNmeaArchive(entryId: string): Promise<void> {
  await db.nmeaArchives.delete(entryId)
}

export function downloadNmeaArchive(record: NmeaArchiveRecord): void {
  const blob = new Blob([record.rawText], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = record.filename || 'track.nmea'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
