import type { TFunction } from 'i18next'
import type { LogEventPayload } from '../../utils/logEntryPayload.js'
import { normalizeLogEvent } from '../../utils/logEntryPayload.js'
import { formatCourseAngle } from '../../utils/courseAngle.js'
import { formatAppDecimal, formatCanonicalCoordinate } from '../../utils/numberFormat.js'
import { degreesToCardinal } from '../../utils/courseAngle.js'
import type {
  NmeaChangeEvent,
  NmeaImportMode,
  NmeaJournalCandidate,
  NmeaTimePoint
} from './nmeaTypes.js'
import { detectNmeaChanges } from './nmeaChangeDetection.js'
import { intervalTimestamps, sampleAt, timestampToHHMM } from './nmeaTimeSeries.js'

export interface GeneratedNmeaJournal {
  candidates: Array<NmeaJournalCandidate & { event: LogEventPayload }>
}

function pointToLogEvent(
  point: NmeaTimePoint,
  remarks: string,
  sailsOrMotor: string
): LogEventPayload {
  const course = point.cog ?? point.hdt ?? point.hdm
  const mgk = course != null ? formatCourseAngle(course) : ''
  const windDir =
    point.windDir != null ? degreesToCardinal(point.windDir) : ''

  return normalizeLogEvent({
    time: timestampToHHMM(point.timestamp),
    mgk,
    rwk: '',
    windDirection: windDir,
    windStrength: point.windSpeedKnots != null ? String(point.windSpeedKnots) : '',
    windPressure: point.pressureHpa != null ? String(Math.round(point.pressureHpa)) : '',
    gpsLat: point.lat != null ? formatCanonicalCoordinate(point.lat) : '',
    gpsLng: point.lng != null ? formatCanonicalCoordinate(point.lng) : '',
    logReading:
      point.logDistanceNm != null
        ? formatAppDecimal(point.logDistanceNm, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
    sailsOrMotor,
    remarks
  })
}

function changeToSailsOrMotor(type: NmeaChangeEvent['type']): string {
  if (type === 'engine_start') return 'Motor'
  if (type === 'engine_stop') return 'Segel'
  return ''
}

function buildRemarks(change: NmeaChangeEvent, t: TFunction): string {
  const parts: string[] = []
  parts.push(t(change.summaryKey, change.summaryParams ?? {}))
  if (change.data?.depthM != null) {
    parts.push(
      t('logs.nmea_remark_depth', {
        depth: formatAppDecimal(change.data.depthM, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      })
    )
  }
  if (change.confidence === 'low') {
    parts.push(t('logs.nmea_remark_uncertain'))
  }
  return parts.join(' · ')
}

function dedupeCandidates(
  items: Array<NmeaJournalCandidate & { event: LogEventPayload; timestamp: number }>,
  windowMs: number
): Array<NmeaJournalCandidate & { event: LogEventPayload }> {
  const sorted = [...items].sort((a, b) => a.timestamp - b.timestamp)
  const kept: typeof sorted = []

  for (const item of sorted) {
    const near = kept.find((k) => Math.abs(k.timestamp - item.timestamp) <= windowMs)
    if (!near) {
      kept.push(item)
      continue
    }
    if (item.source === 'change' && near.source === 'interval') {
      const idx = kept.indexOf(near)
      kept[idx] = {
        ...item,
        event: {
          ...near.event,
          remarks: [item.event.remarks, near.event.remarks].filter(Boolean).join(' · ')
        }
      }
    }
  }

  return kept
}

export function generateNmeaJournalCandidates(options: {
  points: NmeaTimePoint[]
  mode: NmeaImportMode
  intervalMinutes: number
  t: TFunction
}): GeneratedNmeaJournal {
  const { points, mode, intervalMinutes, t } = options
  const items: Array<NmeaJournalCandidate & { event: LogEventPayload; timestamp: number }> = []

  if (mode === 'interval' || mode === 'both') {
    for (const ts of intervalTimestamps(points, intervalMinutes)) {
      const sample = sampleAt(points, ts)
      if (!sample) continue
      items.push({
        id: `interval-${ts}`,
        timestamp: ts,
        source: 'interval',
        selected: true,
        event: pointToLogEvent(sample, t('logs.nmea_remark_interval'), '')
      })
    }
  }

  if (mode === 'change' || mode === 'both') {
    const changes = detectNmeaChanges(points)
    for (const change of changes) {
      const sample = change.data ?? sampleAt(points, change.timestamp)
      if (!sample) continue
      items.push({
        id: `change-${change.type}-${change.timestamp}`,
        timestamp: change.timestamp,
        source: 'change',
        changeType: change.type,
        confidence: change.confidence,
        selected: true,
        event: pointToLogEvent(
          { ...sample, timestamp: change.timestamp },
          buildRemarks(change, t),
          changeToSailsOrMotor(change.type)
        )
      })
    }
  }

  const deduped = mode === 'both'
    ? dedupeCandidates(items, 15 * 60 * 1000)
    : items

  return { candidates: deduped }
}
