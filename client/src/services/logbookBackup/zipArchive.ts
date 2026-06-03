import { strToU8, unzipSync, zipSync } from 'fflate'
import { parseManifestJson, type BackupManifestV2 } from './manifest.js'

const ZIP_LEVEL = 6

export function buildZipArchive(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: ZIP_LEVEL })
}

export function unzipArchive(data: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(data)
  } catch {
    throw new Error('BACKUP_INVALID_ARCHIVE')
  }
}

export function readManifestFromArchive(
  files: Record<string, Uint8Array>
): BackupManifestV2 {
  const raw = files['manifest.json']
  if (!raw) throw new Error('BACKUP_INVALID_FORMAT')
  const text = new TextDecoder().decode(raw)
  return parseManifestJson(text)
}

export function readTextFile(files: Record<string, Uint8Array>, path: string): string {
  const raw = files[path]
  if (!raw) throw new Error('BACKUP_MISSING_BLOB')
  return new TextDecoder().decode(raw)
}

export function readBinaryFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
  const raw = files[path]
  if (!raw) throw new Error('BACKUP_MISSING_BLOB')
  return raw
}

export function utf8Bytes(text: string): Uint8Array {
  return strToU8(text)
}

export function isZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}
