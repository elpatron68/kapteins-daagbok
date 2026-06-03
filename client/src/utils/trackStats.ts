import type { TrackWaypoint } from '../services/trackUpload.js'
import { formatAppDecimal } from './numberFormat.js'

const NM_IN_METERS = 1852
const MAX_PLAUSIBLE_KNOTS = 50

export interface TrackStats {
  distanceNm: number
  speedMaxKn: number
  speedAvgKn: number
  durationMinutes: number
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function hasMeaningfulTimestamps(waypoints: TrackWaypoint[]): boolean {
  if (waypoints.length < 2) return false
  const first = waypoints[0].timestamp
  const last = waypoints[waypoints.length - 1].timestamp
  return last > first + 60_000
}

export function computeTrackStats(waypoints: TrackWaypoint[]): TrackStats | null {
  if (waypoints.length < 2) return null

  let totalMeters = 0
  let maxSegmentKn = 0
  let maxTaggedKn = 0
  let hasTaggedSpeed = false

  const timed = hasMeaningfulTimestamps(waypoints)
  const firstTs = waypoints[0].timestamp
  const lastTs = waypoints[waypoints.length - 1].timestamp

  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1]
    const curr = waypoints[i]
    const segmentM = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng)
    totalMeters += segmentM

    if (timed) {
      const dtMs = curr.timestamp - prev.timestamp
      if (dtMs > 0 && segmentM > 0) {
        const segmentKn = (segmentM / NM_IN_METERS) / (dtMs / 3_600_000)
        if (segmentKn <= MAX_PLAUSIBLE_KNOTS) {
          maxSegmentKn = Math.max(maxSegmentKn, segmentKn)
        }
      }
    }

    if (curr.speedKnots != null && curr.speedKnots > 0) {
      hasTaggedSpeed = true
      maxTaggedKn = Math.max(maxTaggedKn, curr.speedKnots)
    }
  }

  const distanceNm = totalMeters / NM_IN_METERS
  if (distanceNm <= 0) return null

  let speedMaxKn = 0
  let speedAvgKn = 0
  let durationMinutes = 0

  if (timed) {
    const durationHours = (lastTs - firstTs) / 3_600_000
    durationMinutes = Math.round((lastTs - firstTs) / 60_000)
    speedAvgKn = durationHours > 0 ? distanceNm / durationHours : 0
    speedMaxKn = Math.max(maxSegmentKn, hasTaggedSpeed ? maxTaggedKn : 0)
  } else if (hasTaggedSpeed) {
    const taggedSpeeds = waypoints
      .map((wp) => wp.speedKnots)
      .filter((speed): speed is number => speed != null && speed > 0)
    speedMaxKn = maxTaggedKn
    speedAvgKn =
      taggedSpeeds.length > 0
        ? taggedSpeeds.reduce((sum, speed) => sum + speed, 0) / taggedSpeeds.length
        : 0
  }

  return {
    distanceNm: Number(distanceNm.toFixed(2)),
    speedMaxKn: Number(speedMaxKn.toFixed(1)),
    speedAvgKn: Number(speedAvgKn.toFixed(1)),
    durationMinutes
  }
}

export function formatTrackStats(stats: TrackStats): {
  distanceNm: string
  speedMaxKn: string
  speedAvgKn: string
} {
  return {
    distanceNm: formatAppDecimal(stats.distanceNm, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    speedMaxKn:
      stats.speedMaxKn > 0
        ? formatAppDecimal(stats.speedMaxKn, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : '',
    speedAvgKn:
      stats.speedAvgKn > 0
        ? formatAppDecimal(stats.speedAvgKn, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : ''
  }
}
