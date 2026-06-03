import { describe, expect, it } from 'vitest'
import {
  dexieFieldsFromEncBytes,
  encBytesFromDexieFields,
  ENC_HEADER_SIZE
} from './encBlob.js'

function toB64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('encBlob', () => {
  it('round-trips dexie AES-GCM fields', () => {
    const fields = {
      encryptedData: toB64([9, 8, 7]),
      iv: toB64(Array.from({ length: 12 }, (_, i) => i)),
      tag: toB64(Array.from({ length: 16 }, (_, i) => i + 20))
    }
    const enc = encBytesFromDexieFields(fields)
    expect(enc.byteLength).toBe(ENC_HEADER_SIZE + 3)
    expect(dexieFieldsFromEncBytes(enc)).toEqual(fields)
  })

  it('rejects invalid magic', () => {
    expect(() => dexieFieldsFromEncBytes(new Uint8Array(40))).toThrow('BACKUP_INVALID_ENC')
  })
})
