import { describe, expect, it } from 'vitest'
import { findSeaLevelExtrema } from './openMeteoTides.js'

describe('findSeaLevelExtrema', () => {
  it('detects one high and one low from a simple sinusoidal day', () => {
    const times = [
      '2026-06-11T00:00',
      '2026-06-11T01:00',
      '2026-06-11T02:00',
      '2026-06-11T03:00',
      '2026-06-11T04:00',
      '2026-06-11T05:00',
      '2026-06-11T06:00'
    ]
    const levels = [1.0, 0.0, -1.0, 0.0, 1.0, 0.0, -1.0]
    const extrema = findSeaLevelExtrema(times, levels, 'Europe/Berlin')

    expect(extrema.some((e) => e.isHigh)).toBe(true)
    expect(extrema.some((e) => !e.isHigh)).toBe(true)
    expect(extrema.every((e) => e.date === '2026-06-11')).toBe(true)
  })
})
