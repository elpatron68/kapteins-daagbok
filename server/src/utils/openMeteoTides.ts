const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine'
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search'
const FETCH_TIMEOUT_MS = 15_000
const FORECAST_DAYS = 7

export interface TideExtreme {
  time: string
  date: string
  height: number
  isHigh: boolean
}

export type TideLocationSource = 'coordinates' | 'geocoded' | 'bsh_station'

export interface TideLookupResult {
  location: {
    name?: string
    lat: number
    lon: number
    source: TideLocationSource
    stationId?: string
  }
  tides: {
    data: {
      timezone: string
      datum: 'MSL' | 'gauge'
      source: string
      extrema: TideExtreme[]
    }
  }
}

interface MarineResponse {
  timezone?: string
  utc_offset_seconds?: number
  hourly?: {
    time?: string[]
    sea_level_height_msl?: Array<number | null>
  }
}

interface GeocodingResult {
  name: string
  latitude: number
  longitude: number
  country_code?: string
  admin1?: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const data = await res.json()
    if (!res.ok) {
      const message =
        typeof (data as { reason?: string })?.reason === 'string'
          ? (data as { reason: string }).reason
          : `Upstream HTTP ${res.status}`
      throw new Error(message)
    }
    return data as T
  } finally {
    clearTimeout(timeout)
  }
}

function localDateFromIso(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

function interpolateExtremumTime(
  t0: number,
  y0: number,
  t1: number,
  y1: number,
  t2: number,
  y2: number
): { timeOffsetHours: number; height: number } {
  const denom = y0 - 2 * y1 + y2
  if (Math.abs(denom) < 1e-6) {
    return { timeOffsetHours: t1, height: y1 }
  }
  const offset = 0.5 * (y0 - y2) / denom
  const clamped = Math.max(t0, Math.min(t2, offset))
  const height = y1 + 0.25 * (y0 - y2) * (clamped - t1)
  return { timeOffsetHours: clamped, height }
}

function localHourlyTimeToUtcIso(localIso: string, utcOffsetSeconds: number): string {
  const [datePart, timePart] = localIso.split('T')
  if (!datePart || !timePart) return localIso
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return localIso
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - utcOffsetSeconds * 1000
  return new Date(utcMs).toISOString()
}

function addFractionalHoursToLocalIso(localIso: string, deltaHours: number): string {
  const [datePart, timePart] = localIso.split('T')
  if (!datePart || !timePart) return localIso
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return localIso
  const totalMinutes = hour * 60 + minute + Math.round(deltaHours * 60)
  const dayOffset = Math.floor(totalMinutes / (24 * 60))
  const minutesInDay = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const nextDay = new Date(Date.UTC(year, month - 1, day + dayOffset))
  const y = nextDay.getUTCFullYear()
  const m = String(nextDay.getUTCMonth() + 1).padStart(2, '0')
  const d = String(nextDay.getUTCDate()).padStart(2, '0')
  const hh = String(Math.floor(minutesInDay / 60)).padStart(2, '0')
  const mm = String(minutesInDay % 60).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}`
}

export function findSeaLevelExtrema(
  times: string[],
  levels: Array<number | null>,
  timeZone: string,
  utcOffsetSeconds = 0
): TideExtreme[] {
  const extrema: TideExtreme[] = []
  if (times.length < 3) return extrema

  for (let i = 1; i < times.length - 1; i += 1) {
    const prev = levels[i - 1]
    const curr = levels[i]
    const next = levels[i + 1]
    if (prev == null || curr == null || next == null) continue

    const isHigh = curr >= prev && curr >= next && (curr > prev || curr > next)
    const isLow = curr <= prev && curr <= next && (curr < prev || curr < next)
    if (!isHigh && !isLow) continue

    const { timeOffsetHours, height } = interpolateExtremumTime(
      i - 1,
      prev,
      i,
      curr,
      i + 1,
      next
    )
    const localIso = addFractionalHoursToLocalIso(times[i], timeOffsetHours - i)
    const iso = localHourlyTimeToUtcIso(localIso, utcOffsetSeconds)
    extrema.push({
      time: iso,
      date: localDateFromIso(iso, timeZone),
      height: Number(height.toFixed(2)),
      isHigh
    })
  }

  return extrema
}

export async function fetchTidesForCoordinates(
  lat: number,
  lon: number,
  options?: { name?: string; source?: 'coordinates' | 'geocoded' }
): Promise<TideLookupResult> {
  const url = new URL(MARINE_API)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', 'sea_level_height_msl')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('forecast_days', String(FORECAST_DAYS))

  const data = await fetchJson<MarineResponse>(url.toString())
  const times = data.hourly?.time ?? []
  const levels = data.hourly?.sea_level_height_msl ?? []
  const timezone = data.timezone || 'UTC'
  const utcOffsetSeconds = data.utc_offset_seconds ?? 0

  if (times.length === 0 || levels.length === 0) {
    throw new Error('no_tide_data')
  }

  const extrema = findSeaLevelExtrema(times, levels, timezone, utcOffsetSeconds)
  if (extrema.length === 0) {
    throw new Error('no_tide_data')
  }

  return {
    location: {
      name: options?.name,
      lat,
      lon,
      source: options?.source ?? 'coordinates'
    },
    tides: {
      data: {
        timezone,
        datum: 'MSL',
        source:
          'Open-Meteo Marine (MeteoFrance SMOC, 0.08° grid) — model-derived, MSL not chart datum',
        extrema
      }
    }
  }
}

function scoreGeocodingResult(query: string, result: GeocodingResult): number {
  const q = query.trim().toLowerCase()
  const name = result.name.toLowerCase()
  let score = 0
  if (name === q) score += 100
  if (name.startsWith(q) || q.startsWith(name)) score += 40
  if (result.country_code === 'DE' || result.country_code === 'NO' || result.country_code === 'DK') {
    score += 10
  }
  if (result.admin1?.toLowerCase().includes('niedersachsen') || result.admin1?.toLowerCase().includes('lower saxony')) {
    score += 5
  }
  return score
}

export async function geocodePlace(query: string): Promise<GeocodingResult | null> {
  const url = new URL(GEOCODING_API)
  url.searchParams.set('name', query.trim())
  url.searchParams.set('count', '10')
  url.searchParams.set('language', 'de')

  const data = await fetchJson<{ results?: GeocodingResult[] }>(url.toString())
  const results = data.results ?? []
  if (results.length === 0) return null

  return [...results].sort((a, b) => scoreGeocodingResult(query, b) - scoreGeocodingResult(query, a))[0]
}

export async function fetchTidesForPlace(query: string): Promise<TideLookupResult> {
  const place = await geocodePlace(query)
  if (!place) {
    const err = new Error('place_not_found') as Error & { status?: number }
    err.status = 404
    throw err
  }

  return fetchTidesForCoordinates(place.latitude, place.longitude, {
    name: place.name,
    source: 'geocoded'
  })
}
