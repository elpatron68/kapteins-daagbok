import type { TFunction } from 'i18next'
import type { LogEventPayload } from './logEntryPayload.js'
import {
  LIVE_EVENT_CODES,
  parseLiveCommentRemark,
  parseLiveSailsRemark
} from './liveEventCodes.js'

export function formatEventSummary(event: LogEventPayload, t: TFunction): string {
  const code = event.remarks.trim()

  if (code === LIVE_EVENT_CODES.MOTOR_START) return t('logs.live_motor_start')
  if (code === LIVE_EVENT_CODES.MOTOR_STOP) return t('logs.live_motor_stop')
  if (code === LIVE_EVENT_CODES.CAST_OFF) return t('logs.live_cast_off')
  if (code === LIVE_EVENT_CODES.MOOR) return t('logs.live_moor')

  const sails = parseLiveSailsRemark(code)
  if (sails) return t('logs.live_sails', { sails })

  const comment = parseLiveCommentRemark(code)
  if (comment) return comment

  if (code === LIVE_EVENT_CODES.FIX) {
    if (event.gpsLat && event.gpsLng) {
      return t('logs.live_fix_coords', { lat: event.gpsLat, lng: event.gpsLng })
    }
    return t('logs.live_fix')
  }

  if (code && !code.startsWith('__live:')) {
    return code
  }

  const parts: string[] = []
  if (event.sailsOrMotor) parts.push(event.sailsOrMotor)
  if (event.mgk) parts.push(`${t('logs.event_mgk')} ${event.mgk}`)
  if (event.windDirection || event.windStrength) {
    parts.push([event.windDirection, event.windStrength].filter(Boolean).join(' '))
  }
  if (event.windPressure) parts.push(`${t('logs.event_wind_pressure')}: ${event.windPressure}`)
  if (event.gpsLat && event.gpsLng) {
    parts.push(`${event.gpsLat}, ${event.gpsLng}`)
  }

  return parts.join(' · ') || t('logs.live_event_generic')
}
