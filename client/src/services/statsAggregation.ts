import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { decryptJson } from './crypto.js'
import { decryptLogbookTitle } from './logbook.js'
import { getDecryptedTrack, type TrackWaypoint } from './trackUpload.js'
import { compareTravelDaysChronological } from '../utils/logEntryTankLevels.js'
import type { LogEntryPayloadInput } from '../utils/logEntryPayload.js'
import {
  parseEventDistanceNm,
  splitDistanceByPropulsion
} from '../utils/propulsionStats.js'

export type DistanceSource = 'gps' | 'events' | 'none'

export interface TravelDayStats {
  entryId: string
  logbookId: string
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  distanceNm: number
  distanceSource: DistanceSource
  fuelConsumptionL: number
  freshwaterConsumptionL: number
  sailDistanceNm: number
  motorDistanceNm: number
  unknownPropulsionNm: number
  hasGpsTrack: boolean
}

export interface TrackSegment {
  entryId: string
  dayOfTravel: string
  label: string
  waypoints: TrackWaypoint[]
  colorIndex: number
}

export interface LogbookStatsSummary {
  logbookId: string
  title: string
  travelDays: TravelDayStats[]
  routePorts: string[]
  trackSegments: TrackSegment[]
  totals: StatsTotals
}

export interface AccountStatsSummary {
  logbooks: LogbookStatsSummary[]
  totals: StatsTotals
}

export interface StatsTotals {
  travelDayCount: number
  daysWithGps: number
  totalDistanceNm: number
  sailDistanceNm: number
  motorDistanceNm: number
  unknownPropulsionNm: number
  totalFuelL: number
  totalFreshwaterL: number
  avgDistancePerDayNm: number
  avgFuelPerDayL: number
  avgFreshwaterPerDayL: number
  fuelPerNmL: number | null
}

const TRACK_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#84cc16'
]

function resolveDistanceNm(payload: LogEntryPayloadInput): { distanceNm: number; distanceSource: DistanceSource } {
  const gpsDistance = Number(payload.trackDistanceNm) || 0
  if (gpsDistance > 0) {
    return { distanceNm: gpsDistance, distanceSource: 'gps' }
  }

  const eventSum = (payload.events || []).reduce(
    (sum, event) => sum + parseEventDistanceNm(event.distance),
    0
  )
  if (eventSum > 0) {
    return { distanceNm: Number(eventSum.toFixed(2)), distanceSource: 'events' }
  }

  return { distanceNm: 0, distanceSource: 'none' }
}

function buildTotals(days: TravelDayStats[]): StatsTotals {
  const travelDayCount = days.length
  const daysWithGps = days.filter((d) => d.hasGpsTrack).length
  const totalDistanceNm = days.reduce((sum, d) => sum + d.distanceNm, 0)
  const sailDistanceNm = days.reduce((sum, d) => sum + d.sailDistanceNm, 0)
  const motorDistanceNm = days.reduce((sum, d) => sum + d.motorDistanceNm, 0)
  const unknownPropulsionNm = days.reduce((sum, d) => sum + d.unknownPropulsionNm, 0)
  const totalFuelL = days.reduce((sum, d) => sum + d.fuelConsumptionL, 0)
  const totalFreshwaterL = days.reduce((sum, d) => sum + d.freshwaterConsumptionL, 0)

  return {
    travelDayCount,
    daysWithGps,
    totalDistanceNm: Number(totalDistanceNm.toFixed(2)),
    sailDistanceNm: Number(sailDistanceNm.toFixed(2)),
    motorDistanceNm: Number(motorDistanceNm.toFixed(2)),
    unknownPropulsionNm: Number(unknownPropulsionNm.toFixed(2)),
    totalFuelL: Number(totalFuelL.toFixed(1)),
    totalFreshwaterL: Number(totalFreshwaterL.toFixed(1)),
    avgDistancePerDayNm:
      travelDayCount > 0 ? Number((totalDistanceNm / travelDayCount).toFixed(2)) : 0,
    avgFuelPerDayL:
      travelDayCount > 0 ? Number((totalFuelL / travelDayCount).toFixed(1)) : 0,
    avgFreshwaterPerDayL:
      travelDayCount > 0 ? Number((totalFreshwaterL / travelDayCount).toFixed(1)) : 0,
    fuelPerNmL:
      totalDistanceNm > 0 && totalFuelL > 0
        ? Number((totalFuelL / totalDistanceNm).toFixed(2))
        : null
  }
}

export function buildRoutePorts(days: TravelDayStats[]): string[] {
  const ports: string[] = []
  for (const day of days) {
    const dep = day.departure.trim()
    const dest = day.destination.trim()
    if (dep && (ports.length === 0 || ports[ports.length - 1] !== dep)) {
      ports.push(dep)
    }
    if (dest && (ports.length === 0 || ports[ports.length - 1] !== dest)) {
      ports.push(dest)
    }
  }
  return ports
}

async function loadTravelDaysForLogbook(
  logbookId: string,
  includeTracks: boolean
): Promise<{ days: TravelDayStats[]; trackSegments: TrackSegment[] }> {
  const masterKey = (await getLogbookKey(logbookId)) || getActiveMasterKey()
  if (!masterKey) {
    throw new Error('Encryption key not found. Please log in.')
  }

  const localEntries = await db.entries.where({ logbookId }).toArray()
  const days: TravelDayStats[] = []
  const trackSegments: TrackSegment[] = []

  for (const entry of localEntries) {
    const decrypted = await decryptJson(entry.encryptedData, entry.iv, entry.tag, masterKey)
    if (!decrypted) continue

    const payload = decrypted as LogEntryPayloadInput
    const { distanceNm, distanceSource } = resolveDistanceNm(payload)
    const propulsion = splitDistanceByPropulsion(distanceNm, payload.events || [])

    let hasGpsTrack = false
    if (includeTracks) {
      const track = await getDecryptedTrack(entry.payloadId)
      if (track && track.waypoints.length >= 2) {
        hasGpsTrack = true
        trackSegments.push({
          entryId: entry.payloadId,
          dayOfTravel: payload.dayOfTravel || '',
          label: payload.dayOfTravel || '?',
          waypoints: track.waypoints,
          colorIndex: trackSegments.length % TRACK_COLORS.length
        })
      }
    } else {
      hasGpsTrack = !!(await db.gpsTracks.get(entry.payloadId))
    }

    days.push({
      entryId: entry.payloadId,
      logbookId,
      date: payload.date || '',
      dayOfTravel: payload.dayOfTravel || '',
      departure: payload.departure || '',
      destination: payload.destination || '',
      distanceNm,
      distanceSource,
      fuelConsumptionL: Number(payload.fuel?.consumption) || 0,
      freshwaterConsumptionL: Number(payload.freshwater?.consumption) || 0,
      sailDistanceNm: propulsion.sailDistanceNm,
      motorDistanceNm: propulsion.motorDistanceNm,
      unknownPropulsionNm: propulsion.unknownPropulsionNm,
      hasGpsTrack
    })
  }

  days.sort(compareTravelDaysChronological)
  trackSegments.sort((a, b) => Number(a.dayOfTravel) - Number(b.dayOfTravel))

  return { days, trackSegments }
}

export async function loadLogbookStats(
  logbookId: string,
  title: string,
  includeTracks = true
): Promise<LogbookStatsSummary> {
  const { days, trackSegments } = await loadTravelDaysForLogbook(logbookId, includeTracks)
  return {
    logbookId,
    title,
    travelDays: days,
    routePorts: buildRoutePorts(days),
    trackSegments,
    totals: buildTotals(days)
  }
}

export async function loadAccountStats(includeTracks = false): Promise<AccountStatsSummary> {
  const logbooks = await db.logbooks.toArray()
  const summaries: LogbookStatsSummary[] = []

  for (const lb of logbooks) {
    const title = await decryptLogbookTitle(lb.id, lb.encryptedTitle)
    summaries.push(await loadLogbookStats(lb.id, title, includeTracks))
  }

  summaries.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))

  const allDays = summaries.flatMap((s) => s.travelDays)
  return {
    logbooks: summaries,
    totals: buildTotals(allDays)
  }
}

export function getTrackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length]
}

export function formatNm(value: number): string {
  return value.toFixed(2)
}

export function formatLiters(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
