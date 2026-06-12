export interface TideExtreme {
  time: string
  date: string
  height: number
  isHigh: boolean
}

export interface ParsedTideTimes {
  highWater: string
  lowWater: string
  placeName?: string
  distanceKm?: number
  timezone: string
}

function isoToHHMM(iso: string, timeZone: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readExtrema(data: Record<string, unknown>): TideExtreme[] {
  const raw = data.extrema
  if (!Array.isArray(raw)) return []
  const out: TideExtreme[] = []
  for (const item of raw) {
    const row = asRecord(item)
    if (!row) continue
    const time = String(row.time ?? '').trim()
    const date = String(row.date ?? '').trim()
    if (!time || !date) continue
    out.push({
      time,
      date,
      height: Number(row.height ?? 0),
      isHigh: row.isHigh === true || row.type === 'high'
    })
  }
  return out
}

/** Normalize TideTurtle nearby or place JSON into extrema + metadata. */
export function extractTideTurtlePayload(data: Record<string, unknown>): {
  extrema: TideExtreme[]
  timezone: string
  placeName?: string
  distanceKm?: number
} {
  const place = asRecord(data.place)
  const location = asRecord(data.location)
  const tidesRoot = asRecord(data.tides) ?? data
  const tidesData = asRecord(tidesRoot.data) ?? tidesRoot
  const spatial = asRecord(tidesData.spatialCoverage) ?? asRecord(data.spatialCoverage)

  const timezone = String(tidesData.timezone ?? 'UTC')
  const extrema = readExtrema(tidesData)

  let placeName = place?.name ? String(place.name) : undefined
  if (!placeName && location?.name) placeName = String(location.name)
  if (!placeName && spatial?.name) placeName = String(spatial.name)

  const distanceKm =
    data.distanceKm != null && data.distanceKm !== ''
      ? Number(data.distanceKm)
      : undefined

  return { extrema, timezone, placeName, distanceKm }
}

/** First high and first low tide on entryDate (YYYY-MM-DD). */
export function parseTideTurtleForDate(
  data: Record<string, unknown>,
  entryDate: string
): ParsedTideTimes {
  const { extrema, timezone, placeName, distanceKm } = extractTideTurtlePayload(data)

  let highWater = ''
  let lowWater = ''

  for (const extreme of extrema) {
    if (extreme.date !== entryDate) continue
    if (extreme.isHigh && !highWater) {
      highWater = isoToHHMM(extreme.time, timezone)
    }
    if (!extreme.isHigh && !lowWater) {
      lowWater = isoToHHMM(extreme.time, timezone)
    }
    if (highWater && lowWater) break
  }

  return { highWater, lowWater, placeName, distanceKm, timezone }
}
