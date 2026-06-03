import { formatAppDecimal } from '../../utils/numberFormat.js'
import type { NmeaChangeEvent, NmeaDetectionConfig, NmeaTimePoint } from './nmeaTypes.js'
import { DEFAULT_NMEA_DETECTION_CONFIG } from './nmeaTypes.js'
import { angularDelta } from './nmeaTimeSeries.js'

function formatNmeaDecimal(value: number): string {
  return formatAppDecimal(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function pushUnique(events: NmeaChangeEvent[], event: NmeaChangeEvent, minGapMs: number) {
  const last = events[events.length - 1]
  if (last && last.type === event.type && event.timestamp - last.timestamp < minGapMs) return
  events.push(event)
}

export function detectNmeaChanges(
  points: NmeaTimePoint[],
  config: NmeaDetectionConfig = DEFAULT_NMEA_DETECTION_CONFIG
): NmeaChangeEvent[] {
  const events: NmeaChangeEvent[] = []
  if (points.length < 2) return events

  let lastCourse: number | undefined
  let lastWindDir: number | undefined
  let lastWindSpeed: number | undefined
  let lastPressure: number | undefined
  let lastDepth: number | undefined
  let lastWaterTemp: number | undefined
  let lastFix: boolean | undefined
  let engineRunning = false
  let autopilot: boolean | undefined
  let underWay = false
  let stoppedSince: number | null = null
  let lastSog: number | undefined

  for (const p of points) {
    const course = p.cog ?? p.hdt ?? p.hdm
    if (course != null && lastCourse != null && (p.sog ?? 0) > 1) {
      if (angularDelta(course, lastCourse) >= config.courseDeltaDeg) {
        pushUnique(events, {
          type: 'course',
          timestamp: p.timestamp,
          confidence: 'high',
          summaryKey: 'logs.nmea_change_course',
          summaryParams: { from: Math.round(lastCourse), to: Math.round(course) },
          data: p
        }, config.dedupeWindowMs)
      }
    }
    if (course != null) lastCourse = course

    if (p.windDir != null && lastWindDir != null) {
      if (angularDelta(p.windDir, lastWindDir) >= config.windDirDeltaDeg) {
        pushUnique(events, {
          type: 'wind',
          timestamp: p.timestamp,
          confidence: 'high',
          summaryKey: 'logs.nmea_change_wind',
          summaryParams: { from: Math.round(lastWindDir), to: Math.round(p.windDir) },
          data: p
        }, config.dedupeWindowMs)
      } else if (
        p.windSpeedKnots != null &&
        lastWindSpeed != null &&
        Math.abs(p.windSpeedKnots - lastWindSpeed) >= config.windSpeedDeltaKnots
      ) {
        pushUnique(events, {
          type: 'wind',
          timestamp: p.timestamp,
          confidence: 'medium',
          summaryKey: 'logs.nmea_change_wind_speed',
          summaryParams: { from: formatNmeaDecimal(lastWindSpeed), to: formatNmeaDecimal(p.windSpeedKnots) },
          data: p
        }, config.dedupeWindowMs)
      }
    }
    if (p.windDir != null) lastWindDir = p.windDir
    if (p.windSpeedKnots != null) lastWindSpeed = p.windSpeedKnots

    if (p.pressureHpa != null && lastPressure != null) {
      if (Math.abs(p.pressureHpa - lastPressure) >= config.pressureDeltaHpa) {
        pushUnique(events, {
          type: 'pressure',
          timestamp: p.timestamp,
          confidence: 'medium',
          summaryKey: 'logs.nmea_change_pressure',
          summaryParams: { from: formatNmeaDecimal(lastPressure), to: formatNmeaDecimal(p.pressureHpa) },
          data: p
        }, config.dedupeWindowMs)
      }
    }
    if (p.pressureHpa != null) lastPressure = p.pressureHpa

    if (p.depthM != null && lastDepth != null) {
      const delta = Math.abs(p.depthM - lastDepth)
      const rel = lastDepth > 0 ? (delta / lastDepth) * 100 : 100
      if (delta >= config.depthDeltaM || rel >= config.depthDeltaPercent) {
        pushUnique(events, {
          type: 'depth',
          timestamp: p.timestamp,
          confidence: 'high',
          summaryKey: 'logs.nmea_change_depth',
          summaryParams: { from: formatNmeaDecimal(lastDepth), to: formatNmeaDecimal(p.depthM) },
          data: p
        }, config.dedupeWindowMs)
      }
    }
    if (p.depthM != null) lastDepth = p.depthM

    if (p.rpm != null) {
      const running = p.rpm >= config.rpmRunning
      const idle = p.rpm <= config.rpmIdle
      if (running && !engineRunning) {
        pushUnique(events, {
          type: 'engine_start',
          timestamp: p.timestamp,
          confidence: 'high',
          summaryKey: 'logs.nmea_change_engine_start',
          summaryParams: { rpm: Math.round(p.rpm) },
          data: p
        }, config.dedupeWindowMs)
        engineRunning = true
      } else if (idle && engineRunning) {
        pushUnique(events, {
          type: 'engine_stop',
          timestamp: p.timestamp,
          confidence: 'high',
          summaryKey: 'logs.nmea_change_engine_stop',
          data: p
        }, config.dedupeWindowMs)
        engineRunning = false
      }
    }

    if (p.autopilotEngaged != null && autopilot != null && p.autopilotEngaged !== autopilot) {
      pushUnique(events, {
        type: p.autopilotEngaged ? 'autopilot_on' : 'autopilot_off',
        timestamp: p.timestamp,
        confidence: 'high',
        summaryKey: p.autopilotEngaged ? 'logs.nmea_change_autopilot_on' : 'logs.nmea_change_autopilot_off',
        data: p
      }, config.dedupeWindowMs)
    }
    if (p.autopilotEngaged != null) autopilot = p.autopilotEngaged

    if (p.fixValid != null && lastFix != null && p.fixValid !== lastFix) {
      pushUnique(events, {
        type: p.fixValid ? 'gps_fix_regained' : 'gps_fix_lost',
        timestamp: p.timestamp,
        confidence: 'high',
        summaryKey: p.fixValid ? 'logs.nmea_change_gps_regained' : 'logs.nmea_change_gps_lost',
        data: p
      }, config.dedupeWindowMs)
    }
    if (p.fixValid != null) lastFix = p.fixValid

    if (p.waterTempC != null && lastWaterTemp != null) {
      if (Math.abs(p.waterTempC - lastWaterTemp) >= 2) {
        pushUnique(events, {
          type: 'water_temp',
          timestamp: p.timestamp,
          confidence: 'medium',
          summaryKey: 'logs.nmea_change_water_temp',
          summaryParams: { from: formatNmeaDecimal(lastWaterTemp), to: formatNmeaDecimal(p.waterTempC) },
          data: p
        }, config.dedupeWindowMs)
      }
    }
    if (p.waterTempC != null) lastWaterTemp = p.waterTempC

    const sog = p.sog ?? 0
    if (sog >= config.sogUnderWayKn && !underWay) {
      if (stoppedSince != null && p.timestamp - stoppedSince >= config.anchorMinutes * 60 * 1000) {
        pushUnique(events, {
          type: 'departure',
          timestamp: p.timestamp,
          confidence: 'medium',
          summaryKey: 'logs.nmea_change_departure',
          data: p
        }, config.dedupeWindowMs)
      }
      underWay = true
      stoppedSince = null
    }
    if (sog <= config.sogStoppedKn && underWay) {
      underWay = false
      stoppedSince = p.timestamp
    }
    if (sog <= config.sogStoppedKn && stoppedSince != null && !underWay) {
      if (p.timestamp - stoppedSince >= config.anchorMinutes * 60 * 1000) {
        pushUnique(events, {
          type: 'anchor',
          timestamp: p.timestamp,
          confidence: 'medium',
          summaryKey: 'logs.nmea_change_anchor',
          data: p
        }, config.dedupeWindowMs)
        stoppedSince = null
      }
    }

    if (lastSog != null && Math.abs(sog - lastSog) >= config.speedDeltaKn) {
      pushUnique(events, {
        type: 'speed',
        timestamp: p.timestamp,
        confidence: 'low',
        summaryKey: 'logs.nmea_change_speed',
        summaryParams: { from: formatNmeaDecimal(lastSog), to: formatNmeaDecimal(sog) },
        data: p
      }, config.dedupeWindowMs)
    }
    lastSog = sog
  }

  return events.sort((a, b) => a.timestamp - b.timestamp)
}
