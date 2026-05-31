import type { TFunction } from 'i18next'
import type { LogEventPayload } from './logEntryPayload.js'
import {
  LIVE_EVENT_CODES,
  parseLiveCommentRemark,
  parseLiveFuelRemark,
  parseLivePrecipRemark,
  parseLiveSailsRemark,
  parseLiveSogRemark,
  parseLiveStwRemark,
  parseLiveTempRemark,
  parseLiveWaterRemark
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

  const temp = parseLiveTempRemark(code)
  if (temp) return t('logs.live_temp_entry', { temp })

  const precip = parseLivePrecipRemark(code)
  if (precip) return t('logs.live_precip_entry', { value: precip })

  const fuel = parseLiveFuelRemark(code)
  if (fuel) return t('logs.live_fuel_entry', { liters: fuel })

  const water = parseLiveWaterRemark(code)
  if (water) return t('logs.live_water_entry', { liters: water })

  const sog = parseLiveSogRemark(code)
  if (sog) return t('logs.live_sog_entry', { speed: sog })

  const stw = parseLiveStwRemark(code)
  if (stw) return t('logs.live_stw_entry', { speed: stw })

  if (code === LIVE_EVENT_CODES.FIX || code === LIVE_EVENT_CODES.AUTO_POSITION) {
    if (event.gpsLat && event.gpsLng) {
      const label = code === LIVE_EVENT_CODES.AUTO_POSITION
        ? t('logs.live_auto_position')
        : t('logs.live_fix')
      return `${label} ${event.gpsLat}, ${event.gpsLng}`
    }
    return code === LIVE_EVENT_CODES.AUTO_POSITION
      ? t('logs.live_auto_position')
      : t('logs.live_fix')
  }

  if (code === LIVE_EVENT_CODES.COURSE && event.mgk) {
    return t('logs.live_course_entry', { course: event.mgk })
  }

  if (code === LIVE_EVENT_CODES.WIND) {
    const wind = [event.windDirection, event.windStrength].filter(Boolean).join(' ')
    return wind ? t('logs.live_wind_entry', { value: wind }) : t('logs.live_wind_btn')
  }

  if (code === LIVE_EVENT_CODES.PRESSURE && event.windPressure) {
    return t('logs.live_pressure_entry', { value: event.windPressure })
  }

  if (code === LIVE_EVENT_CODES.SEA_STATE && event.seaState) {
    return t('logs.live_sea_state_entry', { value: event.seaState })
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
