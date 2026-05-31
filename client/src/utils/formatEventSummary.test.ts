import { describe, expect, it } from 'vitest'
import {
  isMotorRunningFromEvents,
  LIVE_EVENT_CODES,
  liveCommentRemark,
  liveSailsRemark,
  parseLiveCommentRemark,
  parseLiveSailsRemark
} from './liveEventCodes.js'
import { formatEventSummary } from './formatEventSummary.js'
import { normalizeLogEvent } from './logEntryPayload.js'

const t = (key: string, opts?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'logs.live_motor_start': 'Motor start',
    'logs.live_motor_stop': 'Motor stop',
    'logs.live_cast_off': 'Cast off',
    'logs.live_moor': 'Moor',
    'logs.live_sails': `Sails: ${opts?.sails ?? ''}`,
    'logs.live_fix': 'Fix',
    'logs.live_fix_coords': `Fix ${opts?.lat}, ${opts?.lng}`,
    'logs.live_event_generic': 'Event',
    'logs.live_temp_entry': `Temperature ${opts?.temp} °C`,
    'logs.live_pressure_entry': `Pressure ${opts?.value} hPa`,
    'logs.live_wind_entry': `Wind ${opts?.value}`,
    'logs.live_course_entry': `Course ${opts?.course}`,
    'logs.event_mgk': 'Course',
    'logs.event_wind_pressure': 'Pressure'
  }
  return map[key] ?? key
}

describe('liveEventCodes', () => {
  it('derives motor running from last motor event', () => {
    const events = [
      { remarks: LIVE_EVENT_CODES.MOTOR_START },
      { remarks: LIVE_EVENT_CODES.MOTOR_STOP },
      { remarks: LIVE_EVENT_CODES.MOTOR_START }
    ]
    expect(isMotorRunningFromEvents(events)).toBe(true)
  })

  it('returns false when last motor event is stop', () => {
    const events = [
      { remarks: LIVE_EVENT_CODES.MOTOR_START },
      { remarks: LIVE_EVENT_CODES.MOTOR_STOP }
    ]
    expect(isMotorRunningFromEvents(events)).toBe(false)
  })

  it('parses sail and comment remarks', () => {
    expect(parseLiveSailsRemark(liveSailsRemark('Main + Genoa'))).toBe('Main + Genoa')
    expect(parseLiveCommentRemark(liveCommentRemark('Wind dreht'))).toBe('Wind dreht')
  })
})

describe('formatEventSummary', () => {
  it('formats live motor start', () => {
    const event = normalizeLogEvent({ time: '08:10', remarks: LIVE_EVENT_CODES.MOTOR_START })
    expect(formatEventSummary(event, t)).toBe('Motor start')
  })

  it('formats sails remark', () => {
    const event = normalizeLogEvent({
      time: '08:20',
      remarks: liveSailsRemark('Main + Genoa'),
      sailsOrMotor: 'Main + Genoa'
    })
    expect(formatEventSummary(event, t)).toBe('Sails: Main + Genoa')
  })

  it('formats fix with coordinates', () => {
    const event = normalizeLogEvent({
      time: '09:00',
      remarks: LIVE_EVENT_CODES.FIX,
      gpsLat: '54.323000',
      gpsLng: '10.145000'
    })
    expect(formatEventSummary(event, t)).toBe('Fix 54.323000, 10.145000')
  })

  it('formats pressure entry', () => {
    const event = normalizeLogEvent({
      time: '09:00',
      remarks: LIVE_EVENT_CODES.PRESSURE,
      windPressure: '1013'
    })
    expect(formatEventSummary(event, t)).toBe('Pressure 1013 hPa')
  })
})
