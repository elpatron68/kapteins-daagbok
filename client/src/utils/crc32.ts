/** Normalize NMEA text so identical content hashes the same across platforms. */
export function normalizeNmeaTextForCrc(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

/** CRC-32 (IEEE / Ethernet polynomial), uppercase 8-char hex. */
export function crc32Hex(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

export function nmeaFileCrc32(text: string): string {
  return crc32Hex(normalizeNmeaTextForCrc(text))
}
