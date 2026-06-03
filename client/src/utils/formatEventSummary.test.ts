import { describe, expect, it } from 'vitest'
import {
  isMotorRunningFromEvents,
  LIVE_EVENT_CODES,
  liveCommentRemark,
  liveSailsRemark,
  liveSogRemark,
  parseLiveCommentRemark,
  livePhotoRemark,
  liveVoiceRemark,
  parseLiveVoiceRemark,
  parseLiveSailsRemark
} from './liveEventCodes.js'
import { formatEventSummary } from './formatEventSummary.js'
import { normalizeLogEvent } from './logEntryPayload.js'

const t = (key: string, opts?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'logs.live_motor_start': 'Motor Start',
    'logs.live_motor_stop': 'Motor Stop',
    'logs.live_cast_off': 'Cast off',
    'logs.live_moor': 'Moor',
    'logs.live_sails': `Sails: ${opts?.sails ?? ''}`,
    'logs.live_position': 'Position',
    'logs.live_position_coords': `Position ${opts?.lat}, ${opts?.lng}`,
    'logs.live_event_generic': 'Event',
    'logs.live_temp_entry': `Temperature ${opts?.temp} °C`,
    'logs.live_pressure_entry': `Pressure ${opts?.value} hPa`,
    'logs.live_visibility_entry': `Visibility ${opts?.value}`,
    'logs.live_wind_entry': `Wind ${opts?.value}`,
    'logs.live_photo_entry': `Photo: ${opts?.caption}`,
    'logs.live_photo_entry_plain': 'Photo captured',
    'logs.live_voice_entry_plain': 'Voice memo',
    'logs.live_course_entry': `Course ${opts?.course}`,
    'logs.live_sog_entry': `SOG ${opts?.speed} kn`,
    'logs.live_stw_entry': `STW ${opts?.speed} kn`,
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

  it('parses voice remark with uuid', () => {
    const id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    expect(parseLiveVoiceRemark(liveVoiceRemark(id))).toBe(id)
    expect(parseLiveVoiceRemark('__live:voice:not-a-uuid')).toBeNull()
  })
})

describe('formatEventSummary', () => {
  it('formats live motor start', () => {
    const event = normalizeLogEvent({ time: '08:10', remarks: LIVE_EVENT_CODES.MOTOR_START })
    expect(formatEventSummary(event, t)).toBe('Motor Start')
  })

  it('formats sails remark', () => {
    const event = normalizeLogEvent({
      time: '08:20',
      remarks: liveSailsRemark('Main + Genoa'),
      sailsOrMotor: 'Main + Genoa'
    })
    expect(formatEventSummary(event, t)).toBe('Sails: Main + Genoa')
  })

  it('formats position with coordinates', () => {
    const event = normalizeLogEvent({
      time: '09:00',
      remarks: LIVE_EVENT_CODES.POSITION,
      gpsLat: '54.323000',
      gpsLng: '10.145000'
    })
    expect(formatEventSummary(event, t)).toBe('Position 54.323000, 10.145000')
  })

  it('formats pressure entry', () => {
    const event = normalizeLogEvent({
      time: '09:00',
      remarks: LIVE_EVENT_CODES.PRESSURE,
      windPressure: '1013'
    })
    expect(formatEventSummary(event, t)).toBe('Pressure 1013 hPa')
  })

  it('formats visibility entry', () => {
    const event = normalizeLogEvent({
      time: '09:00',
      remarks: LIVE_EVENT_CODES.VISIBILITY,
      visibility: '10 km'
    })
    expect(formatEventSummary(event, t)).toBe('Visibility 10 km')
  })

  it('formats SOG entry', () => {
    const event = normalizeLogEvent({
      time: '10:15',
      remarks: liveSogRemark('5.2')
    })
    expect(formatEventSummary(event, t)).toBe('SOG 5.2 kn')
  })

  it('formats STW entry', () => {
    const event = normalizeLogEvent({
      time: '10:20',
      remarks: '__live:stw:4.8'
    })
    expect(formatEventSummary(event, t)).toBe('STW 4.8 kn')
  })

  it('formats photo entry', () => {
    const plain = normalizeLogEvent({ time: '11:00', remarks: livePhotoRemark() })
    expect(formatEventSummary(plain, t)).toBe('Photo captured')

    const captioned = normalizeLogEvent({
      time: '11:05',
      remarks: livePhotoRemark('Mastbruch')
    })
    expect(formatEventSummary(captioned, t)).toBe('Photo: Mastbruch')
  })

  it('formats voice memo entry', () => {
    const id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    const event = normalizeLogEvent({ time: '12:00', remarks: liveVoiceRemark(id) })
    expect(formatEventSummary(event, t)).toBe('Voice memo')
  })
})
