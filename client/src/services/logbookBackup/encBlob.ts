import { base64ToBuffer, bufferToBase64 } from '../crypto.js'

export const ENC_MAGIC = new Uint8Array([0x4b, 0x44, 0x41, 0x42]) // KDAB
export const ENC_FORMAT_VERSION = 1
export const ENC_HEADER_SIZE = 33 // 4 + 1 + 12 + 16

export interface DexieEncFields {
  encryptedData: string
  iv: string
  tag: string
}

export function encBytesFromDexieFields(fields: DexieEncFields): Uint8Array {
  const iv = new Uint8Array(base64ToBuffer(fields.iv))
  const tag = new Uint8Array(base64ToBuffer(fields.tag))
  const ciphertext = new Uint8Array(base64ToBuffer(fields.encryptedData))
  if (iv.length !== 12) throw new Error('BACKUP_INVALID_ENC')
  if (tag.length !== 16) throw new Error('BACKUP_INVALID_ENC')

  const out = new Uint8Array(ENC_HEADER_SIZE + ciphertext.length)
  out.set(ENC_MAGIC, 0)
  out[4] = ENC_FORMAT_VERSION
  out.set(iv, 5)
  out.set(tag, 17)
  out.set(ciphertext, 33)
  return out
}

export function dexieFieldsFromEncBytes(bytes: Uint8Array): DexieEncFields {
  if (bytes.length < ENC_HEADER_SIZE) throw new Error('BACKUP_INVALID_ENC')
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== ENC_MAGIC[i]) throw new Error('BACKUP_INVALID_ENC')
  }
  if (bytes[4] !== ENC_FORMAT_VERSION) throw new Error('BACKUP_INVALID_ENC')

  const iv = bufferToBase64(bytes.slice(5, 17).buffer)
  const tag = bufferToBase64(bytes.slice(17, 33).buffer)
  const ciphertext = bufferToBase64(bytes.slice(33).buffer)
  return { encryptedData: ciphertext, iv, tag }
}

export function encByteLength(fields: DexieEncFields): number {
  const ct = base64ToBuffer(fields.encryptedData).byteLength
  return ENC_HEADER_SIZE + ct
}
