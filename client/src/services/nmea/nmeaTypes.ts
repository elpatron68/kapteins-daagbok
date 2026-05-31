export type NmeaChangeType =
  | 'course'
  | 'wind'
  | 'pressure'
  | 'engine_start'
  | 'engine_stop'
  | 'autopilot_on'
  | 'autopilot_off'
  | 'depth'
  | 'anchor'
  | 'departure'
  | 'speed'
  | 'gps_fix_lost'
  | 'gps_fix_regained'
  | 'water_temp'
  | 'wind_shift'

export interface NmeaParseStats {
  totalLines: number
  parsedLines: number
  checksumErrors: number
  sentenceTypes: string[]
}

export interface NmeaTimePoint {
  timestamp: number
  lat?: number
  lng?: number
  cog?: number
  sog?: number
  hdt?: number
  hdm?: number
  windDir?: number
  windSpeedKnots?: number
  depthM?: number
  rpm?: number
  pressureHpa?: number
  waterTempC?: number
  logDistanceNm?: number
  fixValid?: boolean
  autopilotEngaged?: boolean
}

export interface NmeaChangeEvent {
  type: NmeaChangeType
  timestamp: number
  confidence: 'high' | 'medium' | 'low'
  summaryKey: string
  summaryParams?: Record<string, string | number>
  data?: Partial<NmeaTimePoint>
}

export interface NmeaParseResult {
  points: NmeaTimePoint[]
  stats: NmeaParseStats
  warnings: string[]
  rawText: string
  filename: string
}

export type NmeaImportMode = 'interval' | 'change' | 'both'

export interface NmeaJournalCandidate {
  id: string
  timestamp: number
  source: 'interval' | 'change'
  changeType?: NmeaChangeType
  confidence?: 'high' | 'medium' | 'low'
  selected: boolean
}

export interface NmeaDetectionConfig {
  courseDeltaDeg: number
  windDirDeltaDeg: number
  windSpeedDeltaKnots: number
  pressureDeltaHpa: number
  depthDeltaM: number
  depthDeltaPercent: number
  rpmIdle: number
  rpmRunning: number
  sogUnderWayKn: number
  sogStoppedKn: number
  anchorMinutes: number
  speedDeltaKn: number
  dedupeWindowMs: number
}

export const DEFAULT_NMEA_DETECTION_CONFIG: NmeaDetectionConfig = {
  courseDeltaDeg: 28,
  windDirDeltaDeg: 35,
  windSpeedDeltaKnots: 4,
  pressureDeltaHpa: 2,
  depthDeltaM: 2,
  depthDeltaPercent: 25,
  rpmIdle: 400,
  rpmRunning: 800,
  sogUnderWayKn: 2,
  sogStoppedKn: 0.5,
  anchorMinutes: 10,
  speedDeltaKn: 3,
  dedupeWindowMs: 5 * 60 * 1000
}
