import { describe, expect, it } from 'vitest'
import { crc32Hex, nmeaFileCrc32, normalizeNmeaTextForCrc } from './crc32.js'

describe('crc32', () => {
  it('hashes known test vectors', () => {
    expect(crc32Hex('')).toBe('00000000')
    expect(crc32Hex('123456789')).toBe('CBF43926')
  })

  it('normalizes line endings before hashing NMEA content', () => {
    const a = nmeaFileCrc32('$GPRMC,123519,A\r\n$GPGGA,123519\r\n')
    const b = nmeaFileCrc32('$GPRMC,123519,A\n$GPGGA,123519\n')
    expect(a).toBe(b)
    expect(normalizeNmeaTextForCrc('a\r\nb\r')).toBe('a\nb')
  })
})
