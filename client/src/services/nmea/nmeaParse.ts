import type { NmeaParseResult, NmeaParseStats, NmeaTimePoint } from './nmeaTypes.js'

function parseChecksum(line: string): boolean {
  const star = line.lastIndexOf('*')
  if (star < 0) return true
  const expected = line.slice(star + 1, star + 3)
  if (!/^[0-9A-Fa-f]{2}$/.test(expected)) return false
  let sum = 0
  for (let i = 1; i < star; i++) sum ^= line.charCodeAt(i)
  return sum.toString(16).toUpperCase().padStart(2, '0') === expected.toUpperCase()
}

function sentenceType(field0: string): string {
  return field0.length >= 3 ? field0.slice(-3) : field0
}

function parseLatLon(latStr: string, latHem: string, lonStr: string, lonHem: string): { lat?: number; lng?: number } {
  const latVal = parseFloat(latStr)
  const lonVal = parseFloat(lonStr)
  if (Number.isNaN(latVal) || Number.isNaN(lonVal)) return {}
  const latDeg = Math.floor(latVal / 100)
  const latMin = latVal - latDeg * 100
  let lat = latDeg + latMin / 60
  if (latHem === 'S') lat = -lat

  const lonDeg = Math.floor(lonVal / 100)
  const lonMin = lonVal - lonDeg * 100
  let lng = lonDeg + lonMin / 60
  if (lonHem === 'W') lng = -lng

  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
}

function parseRmcDateTime(timeStr: string, dateStr: string, baseYear = new Date().getFullYear()): number | null {
  if (!timeStr || timeStr.length < 6) return null
  const hh = parseInt(timeStr.slice(0, 2), 10)
  const mm = parseInt(timeStr.slice(2, 4), 10)
  const ss = parseInt(timeStr.slice(4, 6), 10)
  if ([hh, mm, ss].some((n) => Number.isNaN(n))) return null

  let year = baseYear
  let month = 0
  let day = 1
  if (dateStr && dateStr.length >= 6) {
    day = parseInt(dateStr.slice(0, 2), 10)
    month = parseInt(dateStr.slice(2, 4), 10) - 1
    const yy = parseInt(dateStr.slice(4, 6), 10)
    year = yy >= 70 ? 1900 + yy : 2000 + yy
  }

  return Date.UTC(year, month, day, hh, mm, ss)
}

function parseWindSpeed(value: string, unit: string): number | undefined {
  const speed = parseFloat(value)
  if (Number.isNaN(speed)) return undefined
  if (unit === 'N') return speed
  if (unit === 'M') return speed * 1.94384
  if (unit === 'K') return speed * 0.539957
  return speed
}

interface MutableState extends NmeaTimePoint {
  lastTimestamp: number | null
}

function snapshot(state: MutableState): NmeaTimePoint | null {
  if (state.lastTimestamp == null) return null
  const { lastTimestamp, ...rest } = state
  void lastTimestamp
  if (
    rest.lat == null &&
    rest.lng == null &&
    rest.cog == null &&
    rest.sog == null &&
    rest.hdt == null &&
    rest.windDir == null &&
    rest.windSpeedKnots == null &&
    rest.depthM == null &&
    rest.rpm == null
  ) {
    return null
  }
  return rest as NmeaTimePoint
}

function pushPoint(points: NmeaTimePoint[], state: MutableState) {
  const snap = snapshot(state)
  if (!snap) return
  const last = points[points.length - 1]
  if (last && last.timestamp === snap.timestamp) {
    points[points.length - 1] = { ...last, ...snap }
    return
  }
  points.push(snap)
}

function applySentence(state: MutableState, type: string, fields: string[], points: NmeaTimePoint[]) {
  switch (type) {
    case 'RMC': {
      const status = fields[2]
      const ts = parseRmcDateTime(fields[1], fields[9])
      if (ts != null) {
        state.timestamp = ts
        state.lastTimestamp = ts
      }
      if (status === 'A') {
        Object.assign(state, parseLatLon(fields[3], fields[4], fields[5], fields[6]))
        state.fixValid = true
        const sog = parseFloat(fields[7])
        const cog = parseFloat(fields[8])
        if (!Number.isNaN(sog)) state.sog = sog
        if (!Number.isNaN(cog)) state.cog = cog
      } else {
        state.fixValid = false
      }
      pushPoint(points, state)
      break
    }
    case 'GGA': {
      const ts = parseRmcDateTime(fields[1], '')
      if (ts != null) {
        state.timestamp = ts
        state.lastTimestamp = ts
      }
      Object.assign(state, parseLatLon(fields[2], fields[3], fields[4], fields[5]))
      const quality = parseInt(fields[6], 10)
      state.fixValid = !Number.isNaN(quality) && quality > 0
      pushPoint(points, state)
      break
    }
    case 'GLL': {
      const ts = parseRmcDateTime(fields[5], fields[6] ?? '')
      if (ts != null) {
        state.timestamp = ts
        state.lastTimestamp = ts
      }
      Object.assign(state, parseLatLon(fields[1], fields[2], fields[3], fields[4]))
      state.fixValid = fields[7] === 'A'
      pushPoint(points, state)
      break
    }
    case 'VTG': {
      const cog = parseFloat(fields[1])
      const sog = parseFloat(fields[5] || fields[7])
      if (!Number.isNaN(cog)) state.cog = cog
      if (!Number.isNaN(sog)) state.sog = sog
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'HDT':
      state.hdt = parseFloat(fields[1])
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    case 'HDM':
      state.hdm = parseFloat(fields[1])
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    case 'HDG': {
      const hdg = parseFloat(fields[1])
      if (!Number.isNaN(hdg)) state.hdm = hdg
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'MWV': {
      if (fields[5] !== 'A') break
      const dir = parseFloat(fields[1])
      const speed = parseWindSpeed(fields[3], fields[4])
      if (!Number.isNaN(dir)) state.windDir = dir
      if (speed != null) state.windSpeedKnots = Number(speed.toFixed(1))
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'MWD': {
      const dir = parseFloat(fields[1])
      const speed = parseFloat(fields[5])
      if (!Number.isNaN(dir)) state.windDir = dir
      if (!Number.isNaN(speed)) state.windSpeedKnots = Number(speed.toFixed(1))
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'DPT':
    case 'DBT': {
      const depth = parseFloat(fields[1])
      if (!Number.isNaN(depth)) state.depthM = depth
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'RPM': {
      const rpm = parseFloat(fields[3] ?? fields[2])
      if (!Number.isNaN(rpm)) state.rpm = rpm
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'MDA': {
      const inchHg = parseFloat(fields[3])
      const hpaField = parseFloat(fields[15] ?? fields[4])
      if (!Number.isNaN(hpaField) && hpaField > 800) state.pressureHpa = hpaField
      else if (!Number.isNaN(inchHg)) state.pressureHpa = inchHg * 33.8639
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'MTW': {
      const temp = parseFloat(fields[1])
      if (!Number.isNaN(temp)) state.waterTempC = temp
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'VLW': {
      const nm = parseFloat(fields[1] ?? fields[2])
      if (!Number.isNaN(nm)) state.logDistanceNm = nm
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    case 'APA': {
      const mode = fields[1]
      state.autopilotEngaged = mode === '1' || mode?.toUpperCase() === 'A'
      if (state.lastTimestamp != null) pushPoint(points, state)
      break
    }
    default:
      break
  }
}

export function parseNmeaFile(text: string, filename: string): NmeaParseResult {
  const warnings: string[] = []
  const points: NmeaTimePoint[] = []
  const typesSeen = new Set<string>()
  let totalLines = 0
  let parsedLines = 0
  let checksumErrors = 0

  const state: MutableState = { timestamp: 0, lastTimestamp: null }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || (!line.startsWith('$') && !line.startsWith('!'))) continue
    totalLines++
    if (!parseChecksum(line)) {
      checksumErrors++
      continue
    }

    const star = line.indexOf('*')
    const body = star >= 0 ? line.slice(0, star) : line
    const fields = body.slice(1).split(',')
    if (fields.length < 2) continue

    const type = sentenceType(fields[0])
    typesSeen.add(type)
    applySentence(state, type, fields, points)
    parsedLines++
  }

  if (points.length === 0) {
    warnings.push('no_samples')
  }
  if (!typesSeen.has('RMC') && !typesSeen.has('GGA') && !typesSeen.has('GLL')) {
    warnings.push('no_position')
  }

  const stats: NmeaParseStats = {
    totalLines,
    parsedLines,
    checksumErrors,
    sentenceTypes: [...typesSeen].sort()
  }

  return { points, stats, warnings, rawText: text, filename }
}

export function nmeaPointsToWaypoints(points: NmeaTimePoint[]): import('../trackUpload.js').TrackWaypoint[] {
  return points
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      timestamp: p.timestamp,
      lat: p.lat!,
      lng: p.lng!,
      speedKnots: p.sog,
      heading: p.cog ?? p.hdt ?? p.hdm
    }))
}
