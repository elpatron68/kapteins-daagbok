import { describe, expect, it } from 'vitest'
import type { NmeaTimePoint } from './nmeaTypes.js'
import { detectNmeaChanges } from './nmeaChangeDetection.js'

function point(
  timestamp: number,
  overrides: Partial<NmeaTimePoint> = {}
): NmeaTimePoint {
  return { timestamp, ...overrides }
}

describe('detectNmeaChanges', () => {
  it('detects significant course changes while underway', () => {
    const points = [
      point(0, { cog: 0, sog: 5 }),
      point(60_000, { cog: 45, sog: 5 })
    ]

    const events = detectNmeaChanges(points, {
      courseDeltaDeg: 30,
      windDirDeltaDeg: 30,
      windSpeedDeltaKnots: 5,
      pressureDeltaHpa: 2,
      depthDeltaM: 1,
      depthDeltaPercent: 25,
      rpmIdle: 400,
      rpmRunning: 800,
      sogUnderWayKn: 2,
      sogStoppedKn: 0.5,
      anchorMinutes: 10,
      speedDeltaKn: 2,
      dedupeWindowMs: 60_000
    })

    expect(events.some((e) => e.type === 'course')).toBe(true)
    const course = events.find((e) => e.type === 'course')
    expect(course?.summaryParams).toMatchObject({ from: 0, to: 45 })
  })

  it('detects engine start when RPM rises above threshold', () => {
    const points = [
      point(0, { sog: 0, rpm: 0 }),
      point(30_000, { sog: 3, rpm: 1200 })
    ]

    const events = detectNmeaChanges(points)
    expect(events.some((e) => e.type === 'engine_start')).toBe(true)
  })

  it('dedupes repeated events within the configured window', () => {
    const points = [
      point(0, { cog: 0, sog: 5 }),
      point(10_000, { cog: 50, sog: 5 }),
      point(20_000, { cog: 100, sog: 5 })
    ]

    const events = detectNmeaChanges(points, {
      courseDeltaDeg: 30,
      windDirDeltaDeg: 30,
      windSpeedDeltaKnots: 5,
      pressureDeltaHpa: 2,
      depthDeltaM: 1,
      depthDeltaPercent: 25,
      rpmIdle: 400,
      rpmRunning: 800,
      sogUnderWayKn: 2,
      sogStoppedKn: 0.5,
      anchorMinutes: 10,
      speedDeltaKn: 2,
      dedupeWindowMs: 120_000
    })

    const courseEvents = events.filter((e) => e.type === 'course')
    expect(courseEvents.length).toBe(1)
  })
})
