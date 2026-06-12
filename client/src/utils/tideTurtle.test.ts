import { describe, expect, it } from 'vitest'
import { parseTideTurtleForDate } from './tideTurtle.js'

const sampleNearby = {
  distanceKm: 1.2,
  place: { name: 'Kiel' },
  tides: {
    data: {
      timezone: 'Europe/Berlin',
      extrema: [
        { time: '2026-06-11T08:50:00.000Z', date: '2026-06-11', height: 0.5, isHigh: true },
        { time: '2026-06-11T14:34:00.000Z', date: '2026-06-11', height: -0.2, isHigh: false },
        { time: '2026-06-12T09:00:00.000Z', date: '2026-06-12', height: 0.6, isHigh: true }
      ]
    }
  }
}

describe('parseTideTurtleForDate', () => {
  it('returns first high and low on entry date in local timezone', () => {
    const parsed = parseTideTurtleForDate(sampleNearby, '2026-06-11')
    expect(parsed.highWater).toBe('10:50')
    expect(parsed.lowWater).toBe('16:34')
    expect(parsed.placeName).toBe('Kiel')
    expect(parsed.distanceKm).toBe(1.2)
  })

  it('reads BSH coordinate response with distance to nearest station', () => {
    const parsed = parseTideTurtleForDate(
      {
        distanceKm: 8,
        location: {
          source: 'bsh_station',
          name: 'Norderney, Riffgat',
          lat: 53.696389,
          lon: 7.157778,
          stationId: 'norderney_riffgat'
        },
        tides: sampleNearby.tides
      },
      '2026-06-11'
    )
    expect(parsed.highWater).toBe('10:50')
    expect(parsed.distanceKm).toBe(8)
    expect(parsed.placeName).toBe('Norderney, Riffgat')
  })

  it('leaves missing tide type empty', () => {
    const parsed = parseTideTurtleForDate(
      {
        data: {
          timezone: 'UTC',
          extrema: [{ time: '2026-06-11T12:00:00.000Z', date: '2026-06-11', height: 1, isHigh: true }]
        }
      },
      '2026-06-11'
    )
    expect(parsed.highWater).toBe('12:00')
    expect(parsed.lowWater).toBe('')
  })
})
