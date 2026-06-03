import { describe, it, expect, vi } from 'vitest'
import { buildTravelDayContext } from './aiSummary.js'
import type { LogEventPayload } from '../utils/logEntryPayload.js'

const t = ((key: string, opts?: Record<string, unknown>) => {
  if (key === 'logs.live_motor_start') return 'Motor started'
  if (key === 'logs.live_event_generic') return 'Event'
  if (opts && 'course' in opts) return `Course ${opts.course}`
  return key
}) as any

describe('buildTravelDayContext', () => {
  it('includes route metadata and formatted events', () => {
    const events: LogEventPayload[] = [
      {
        time: '09:00',
        mgk: '180',
        rwk: '',
        windPressure: '',
        windDirection: '',
        windStrength: '',
        seaState: '',
        visibility: '',
        weatherIcon: '',
        current: '',
        heel: '',
        sailsOrMotor: 'Genua',
        logReading: '',
        distance: '',
        gpsLat: '',
        gpsLng: '',
        remarks: '__live:motor_start'
      }
    ]

    const context = buildTravelDayContext(
      {
        date: '2026-06-03',
        dayOfTravel: '5',
        departure: 'Kiel',
        destination: 'Copenhagen',
        freshwater: { morning: 100, refilled: 0, evening: 80, consumption: 20 },
        fuel: { morning: 50, refilled: 10, evening: 40, consumption: 20 },
        greywaterLevel: 0,
        trackDistanceNm: 42.5,
        motorHours: 3.5,
        events
      },
      t
    )

    expect(context.departure).toBe('Kiel')
    expect(context.destination).toBe('Copenhagen')
    expect(context.trackDistanceNm).toBe(42.5)
    expect(context.motorHours).toBe(3.5)
    expect(context.events).toHaveLength(1)
    expect(context.events[0].summary).toBe('Motor started')
    expect(context.events[0].sailsOrMotor).toBe('Genua')
    expect(context.greywater).toBeUndefined()
  })
})
