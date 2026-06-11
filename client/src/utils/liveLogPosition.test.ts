import { describe, expect, it } from 'vitest'
import {
  getLastLoggedPositionWithin,
  getLatestLoggedPosition,
  LEGACY_LIVE_POSITION_REMARK,
  LIVE_EVENT_CODES,
  LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS
} from './liveEventCodes.js'

describe('live log position', () => {
  it('returns latest position with coordinates', () => {
    const entryDate = '2026-06-01'
    const events = [
      { remarks: LIVE_EVENT_CODES.POSITION, time: '08:00', gpsLat: '54.1', gpsLng: '10.2' },
      { remarks: LIVE_EVENT_CODES.POSITION, time: '12:30', gpsLat: '54.2', gpsLng: '10.3' }
    ]
    const position = getLatestLoggedPosition(events, entryDate)
    expect(position?.lat).toBe('54.2')
    expect(position?.source).toBe('position')
  })

  it('picks latest position by event time even when array is not sorted', () => {
    const entryDate = '2026-06-01'
    const events = [
      { remarks: LIVE_EVENT_CODES.POSITION, time: '14:16', gpsLat: '54.12', gpsLng: '10.65' },
      { remarks: LIVE_EVENT_CODES.POSITION, time: '14:03', gpsLat: '53.62', gpsLng: '7.15' }
    ]
    const position = getLatestLoggedPosition(events, entryDate)
    expect(position?.lat).toBe('54.12')
  })

  it('reads legacy __live:fix remarks', () => {
    const entryDate = '2026-06-01'
    const events = [
      { remarks: LEGACY_LIVE_POSITION_REMARK, time: '09:00', gpsLat: '54.5', gpsLng: '10.5' }
    ]
    const position = getLatestLoggedPosition(events, entryDate)
    expect(position?.lat).toBe('54.5')
    expect(position?.source).toBe('position')
  })

  it('prefers auto-position source when applicable', () => {
    const entryDate = '2026-06-01'
    const events = [
      {
        remarks: LIVE_EVENT_CODES.AUTO_POSITION,
        time: '14:00',
        gpsLat: '54.3',
        gpsLng: '10.4'
      }
    ]
    expect(getLatestLoggedPosition(events, entryDate)?.source).toBe('auto_position')
  })

  it('rejects position older than max age for weather', () => {
    const entryDate = '2026-06-01'
    const noon = new Date('2026-06-01T12:00:00').getTime()
    const events = [
      { remarks: LIVE_EVENT_CODES.POSITION, time: '05:00', gpsLat: '54.0', gpsLng: '10.0' }
    ]
    expect(
      getLastLoggedPositionWithin(events, entryDate, LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS, noon)
    ).toBeNull()
    expect(getLatestLoggedPosition(events, entryDate)).not.toBeNull()
  })

  it('accepts position within six hours', () => {
    const entryDate = '2026-06-01'
    const noon = new Date('2026-06-01T12:00:00').getTime()
    const events = [
      { remarks: LIVE_EVENT_CODES.POSITION, time: '07:00', gpsLat: '54.0', gpsLng: '10.0' }
    ]
    expect(
      getLastLoggedPositionWithin(events, entryDate, LIVE_LOG_WEATHER_POSITION_MAX_AGE_MS, noon)
    ).not.toBeNull()
  })
})
