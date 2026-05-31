import { describe, expect, it } from 'vitest'
import { nmeaPointsToWaypoints, parseNmeaFile } from './nmeaParse.js'

describe('parseNmeaFile', () => {
  it('parses RMC position, course and speed', () => {
    const text = [
      '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W',
      '$GPRMC,133519,A,4808.038,N,01132.000,E,025.0,090.0,230394,003.1,W'
    ].join('\n')

    const result = parseNmeaFile(text, 'test.nmea')

    expect(result.stats.parsedLines).toBe(2)
    expect(result.stats.sentenceTypes).toContain('RMC')
    expect(result.points.length).toBeGreaterThanOrEqual(2)

    const first = result.points[0]
    expect(first.lat).toBeCloseTo(48.1173, 3)
    expect(first.lng).toBeCloseTo(11.516667, 3)
    expect(first.sog).toBe(22.4)
    expect(first.cog).toBe(84.4)
    expect(first.fixValid).toBe(true)
  })

  it('merges wind and depth sentences onto the same timestamp', () => {
    const text = [
      '$GPRMC,100000,A,5400.000,N,01000.000,E,5.0,180.0,010124,003.0,E',
      '$IIMWV,270.0,R,12.5,N,A',
      '$SDDPT,4.5,0.0'
    ].join('\n')

    const result = parseNmeaFile(text, 'merged.nmea')
    const last = result.points[result.points.length - 1]

    expect(last.windDir).toBe(270)
    expect(last.windSpeedKnots).toBe(12.5)
    expect(last.depthM).toBe(4.5)
  })

  it('skips lines with invalid checksum', () => {
    const text = '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*FF'
    const result = parseNmeaFile(text, 'bad.nmea')

    expect(result.stats.checksumErrors).toBe(1)
    expect(result.points).toHaveLength(0)
    expect(result.warnings).toContain('no_samples')
  })

  it('warns when no position sentences are present', () => {
    const text = '$IIMWV,090.0,R,8.0,N,A'
    const result = parseNmeaFile(text, 'wind-only.nmea')

    expect(result.warnings).toContain('no_position')
  })
})

describe('nmeaPointsToWaypoints', () => {
  it('maps points with coordinates to track waypoints', () => {
    const waypoints = nmeaPointsToWaypoints([
      { timestamp: 1, lat: 54.0, lng: 10.0, sog: 6, cog: 90 },
      { timestamp: 2, windDir: 180 },
      { timestamp: 3, lat: 54.01, lng: 10.01, hdt: 95 }
    ])

    expect(waypoints).toHaveLength(2)
    expect(waypoints[0]).toMatchObject({ lat: 54, lng: 10, speedKnots: 6, heading: 90 })
    expect(waypoints[1].heading).toBe(95)
  })
})
