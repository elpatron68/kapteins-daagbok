import { describe, expect, it } from 'vitest'
import { isNmeaCrcAlreadyImported, type NmeaArchiveRecord } from './nmeaArchive.js'
import { nmeaFileCrc32 } from '../utils/crc32.js'

describe('nmeaArchive CRC tracking', () => {
  it('detects duplicate file content by CRC32', () => {
    const text = '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W\n'
    const record: NmeaArchiveRecord = {
      filename: 'a.nmea',
      rawText: '',
      importedAt: '2026-05-29T10:00:00.000Z',
      importedFiles: [{
        crc32: nmeaFileCrc32(text),
        filename: 'a.nmea',
        importedAt: '2026-05-29T10:00:00.000Z'
      }]
    }

    expect(isNmeaCrcAlreadyImported(record, text)).toBe(true)
    expect(isNmeaCrcAlreadyImported(record, text.replace('\n', '\r\n'))).toBe(true)
    expect(isNmeaCrcAlreadyImported(record, '$GPRMC,999999,A\n')).toBe(false)
    expect(isNmeaCrcAlreadyImported(null, text)).toBe(false)
  })
})
