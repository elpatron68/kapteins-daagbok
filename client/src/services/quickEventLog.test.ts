import { describe, expect, it, vi } from 'vitest'
import { tryDecryptEntryPayload } from './quickEventLog.js'

vi.mock('./crypto.js', () => ({
  decryptJson: vi.fn(async (_c: string, _i: string, _t: string) => {
    throw new Error('decrypt failed')
  }),
  encryptJson: vi.fn()
}))

describe('tryDecryptEntryPayload', () => {
  it('returns null when decryption fails', async () => {
    const result = await tryDecryptEntryPayload(
      { encryptedData: 'x', iv: 'y', tag: 'z' },
      new ArrayBuffer(32)
    )
    expect(result).toBeNull()
  })
})
