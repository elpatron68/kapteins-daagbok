import type { NmeaTimePoint } from './nmeaTypes.js'

/** Nearest sample at or before timestamp (carry-forward). */
export function sampleAt(points: NmeaTimePoint[], timestamp: number): NmeaTimePoint | null {
  if (points.length === 0) return null
  let best: NmeaTimePoint | null = null
  for (const p of points) {
    if (p.timestamp <= timestamp) best = p
    else break
  }
  return best ?? points[0]
}

export function filterPointsForDate(points: NmeaTimePoint[], dateYmd: string): NmeaTimePoint[] {
  if (!dateYmd || points.length === 0) return points
  const [y, m, d] = dateYmd.split('-').map((v) => parseInt(v, 10))
  if ([y, m, d].some((n) => Number.isNaN(n))) return points

  const start = Date.UTC(y, m - 1, d, 0, 0, 0)
  const end = Date.UTC(y, m - 1, d, 23, 59, 59)

  const filtered = points.filter((p) => p.timestamp >= start && p.timestamp <= end)
  return filtered.length > 0 ? filtered : points
}

export function timestampToHHMM(timestamp: number, timeZone?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone ?? undefined
  }
  const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(new Date(timestamp))
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hh}:${mm}`
}

export function angularDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

export function intervalTimestamps(
  points: NmeaTimePoint[],
  intervalMinutes: number
): number[] {
  if (points.length === 0) return []
  const start = points[0].timestamp
  const end = points[points.length - 1].timestamp
  const stepMs = intervalMinutes * 60 * 1000
  const stamps: number[] = []
  for (let t = start; t <= end; t += stepMs) {
    stamps.push(t)
  }
  if (stamps[stamps.length - 1] !== end) stamps.push(end)
  return stamps
}
