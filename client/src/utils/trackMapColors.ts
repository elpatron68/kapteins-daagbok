import type { TrackWaypoint } from '../services/trackUpload.js'

const NM_IN_METERS = 1852
const MAX_PLAUSIBLE_KNOTS = 50
const FALLBACK_GREEN = '#16a34a'

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

export function getSegmentSpeedsKn(waypoints: TrackWaypoint[]): number[] {
  if (waypoints.length < 2) return []

  const timed = hasMeaningfulTimestamps(waypoints)
  const speeds: number[] = []

  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1]
    const curr = waypoints[i]
    let speedKn = 0

    const tagged = [prev.speedKnots, curr.speedKnots].filter(
      (value): value is number => value != null && value > 0
    )
    if (tagged.length > 0) {
      speedKn = tagged.reduce((sum, value) => sum + value, 0) / tagged.length
    } else if (timed) {
      const dtMs = curr.timestamp - prev.timestamp
      const segmentM = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng)
      if (dtMs > 0 && segmentM > 0) {
        speedKn = (segmentM / NM_IN_METERS) / (dtMs / 3_600_000)
      }
    }

    if (speedKn > MAX_PLAUSIBLE_KNOTS) speedKn = 0
    speeds.push(speedKn)
  }

  return speeds
}

export function hasSpeedGradientData(speeds: number[]): boolean {
  const valid = speeds.filter((speed) => speed > 0)
  if (valid.length < 2) return false
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  return max - min >= 0.3
}

/** Green (slow) → yellow → red (fast) */
export function speedToTrackColor(speedKn: number, minKn: number, maxKn: number): string {
  if (speedKn <= 0 || maxKn <= minKn) return FALLBACK_GREEN
  const t = Math.max(0, Math.min(1, (speedKn - minKn) / (maxKn - minKn)))
  const hue = 120 - t * 120
  return `hsl(${hue}, 72%, 42%)`
}

export function getTrackLineColor(speeds: number[]): string {
  return hasSpeedGradientData(speeds) ? '' : FALLBACK_GREEN
}
