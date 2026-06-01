import { describe, expect, it } from 'vitest'
import {
  getLastPositionFixWithin,
  getLatestPositionFix,
  LIVE_EVENT_CODES,
  LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS
} from './liveEventCodes.js'

const entryDate = '2026-06-01'

describe('live log position fix', () => {
  it('returns latest fix with coordinates', () => {
    const events = [
      { remarks: LIVE_EVENT_CODES.FIX, time: '08:00', gpsLat: '54.1', gpsLng: '10.2' },
      { remarks: LIVE_EVENT_CODES.FIX, time: '12:30', gpsLat: '54.2', gpsLng: '10.3' }
    ]
    const fix = getLatestPositionFix(events, entryDate)
    expect(fix?.lat).toBe('54.2')
    expect(fix?.source).toBe('fix')
  })

  it('accepts auto-position with GPS', () => {
    const events = [
      {
        remarks: LIVE_EVENT_CODES.AUTO_POSITION,
        time: '14:00',
        gpsLat: '55.0',
        gpsLng: '11.0'
      }
    ]
    expect(getLatestPositionFix(events, entryDate)?.source).toBe('auto_position')
  })

  it('rejects fix older than max age for weather', () => {
    const noon = new Date(`${entryDate}T12:00:00`).getTime()
    const events = [
      { remarks: LIVE_EVENT_CODES.FIX, time: '05:00', gpsLat: '54.0', gpsLng: '10.0' }
    ]
    expect(
      getLastPositionFixWithin(events, entryDate, LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS, noon)
    ).toBeNull()
    expect(getLatestPositionFix(events, entryDate)).not.toBeNull()
  })

  it('accepts fix within six hours', () => {
    const noon = new Date(`${entryDate}T12:00:00`).getTime()
    const events = [
      { remarks: LIVE_EVENT_CODES.FIX, time: '07:00', gpsLat: '54.0', gpsLng: '10.0' }
    ]
    expect(
      getLastPositionFixWithin(events, entryDate, LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS, noon)
    ).not.toBeNull()
  })
})
