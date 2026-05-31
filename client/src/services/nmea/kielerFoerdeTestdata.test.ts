import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseNmeaFile } from './nmeaParse.js'
import { detectNmeaChanges } from './nmeaChangeDetection.js'
import { generateNmeaJournalCandidates } from './nmeaJournalGenerator.js'

const nmeaPath = resolve(import.meta.dirname, '../../../../testdata/tracks/kieler-foerde-5sm.nmea')

describe('kieler-foerde testdata', () => {
  it('parses the sample NMEA log and yields journal candidates', () => {
    const text = readFileSync(nmeaPath, 'utf8')
    const result = parseNmeaFile(text, 'kieler-foerde-5sm.nmea')

    expect(result.stats.checksumErrors).toBe(0)
    expect(result.points.length).toBeGreaterThan(30)
    expect(result.stats.sentenceTypes).toEqual(expect.arrayContaining(['RMC', 'GGA', 'MWV', 'DPT', 'MDA']))

    const changes = detectNmeaChanges(result.points)
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.some((c) => ['wind', 'engine_start', 'departure', 'speed', 'depth'].includes(c.type))).toBe(true)

    const journal = generateNmeaJournalCandidates({
      points: result.points,
      mode: 'both',
      intervalMinutes: 60,
      t: (key) => key
    })
    expect(journal.candidates.length).toBeGreaterThanOrEqual(3)
  })
})
