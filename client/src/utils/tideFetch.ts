import {
  fetchNearbyTideStations,
  fetchTidesByPlace,
  fetchTidesByStation,
  fetchTidesNearby,
  type TideStation,
  TidesApiError
} from '../services/tides.js'
import type { TideFetchLocation } from './tideLocation.js'
import { buildTideLocationMeta, type TideLocationMeta } from './tideLocation.js'
import { extractTideTurtlePayload, parseTideTurtleForDate } from './tideTurtle.js'

export type TideFetchResult = {
  highWater: string
  lowWater: string
  location: TideLocationMeta
  apiData: Record<string, unknown>
}

export type TideFetchNeedsStationPick = {
  kind: 'pick_station'
  entryDate: string
  fetchLocation: TideFetchLocation
  stations: TideStation[]
  queryLat?: string
  queryLng?: string
}

export type TideFetchOutcome = TideFetchResult | TideFetchNeedsStationPick

function readQueryCoords(fetchLocation: TideFetchLocation): { lat?: string; lng?: string } {
  if (fetchLocation.mode === 'nearby') {
    return { lat: fetchLocation.lat, lng: fetchLocation.lng }
  }
  return {}
}

function hasTideTimesForDate(data: Record<string, unknown>, entryDate: string): boolean {
  const parsed = parseTideTurtleForDate(data, entryDate)
  return Boolean(parsed.highWater || parsed.lowWater)
}

function toResult(
  data: Record<string, unknown>,
  entryDate: string,
  fetchLocation: TideFetchLocation
): TideFetchResult | null {
  const parsed = parseTideTurtleForDate(data, entryDate)
  if (!parsed.highWater && !parsed.lowWater) return null
  return {
    highWater: parsed.highWater,
    lowWater: parsed.lowWater,
    location: buildTideLocationMeta(fetchLocation, data),
    apiData: data
  }
}

async function loadNearbyStations(
  fetchLocation: TideFetchLocation,
  stationsFromError?: TideStation[]
): Promise<TideStation[]> {
  if (stationsFromError && stationsFromError.length > 0) {
    return stationsFromError
  }
  if (fetchLocation.mode !== 'nearby') return []
  return fetchNearbyTideStations(fetchLocation.lat, fetchLocation.lng)
}

export async function fetchTidesForEntry(options: {
  fetchLocation: TideFetchLocation
  entryDate: string
  analyticsSource: 'entry_editor' | 'live_log'
}): Promise<TideFetchOutcome> {
  const { fetchLocation, entryDate, analyticsSource } = options
  const queryCoords = readQueryCoords(fetchLocation)
  let stationsFromError: TideStation[] | undefined

  try {
    const data =
      fetchLocation.mode === 'nearby'
        ? await fetchTidesNearby(fetchLocation.lat, fetchLocation.lng, {
            analyticsSource,
            locationSource: fetchLocation.source
          })
        : await fetchTidesByPlace(fetchLocation.query, { analyticsSource })

    const result = toResult(data, entryDate, fetchLocation)
    if (result) return result

    const { extrema } = extractTideTurtlePayload(data)
    if (extrema.length > 0) {
      throw new TidesApiError('No tide data for entry date', 'NO_DATA_FOR_DATE')
    }
  } catch (error) {
    if (error instanceof TidesApiError && error.code === 'NO_DATA_FOR_DATE') {
      throw error
    }
    if (error instanceof TidesApiError && error.stations?.length) {
      stationsFromError = error.stations
    } else if (!(error instanceof TidesApiError) || error.code !== 'NOT_FOUND') {
      throw error
    }
  }

  const stations = await loadNearbyStations(fetchLocation, stationsFromError)
  if (stations.length > 0) {
    return {
      kind: 'pick_station',
      entryDate,
      fetchLocation,
      stations,
      ...queryCoords
    }
  }

  throw new TidesApiError('Tide data not found', 'NOT_FOUND')
}

export async function fetchTidesForStationChoice(options: {
  stationId: string
  entryDate: string
  fetchLocation: TideFetchLocation
  queryLat?: string
  queryLng?: string
  analyticsSource: 'entry_editor' | 'live_log'
}): Promise<TideFetchResult> {
  const data = await fetchTidesByStation(options.stationId, {
    queryLat: options.queryLat,
    queryLng: options.queryLng,
    analyticsSource: options.analyticsSource
  })

  const result = toResult(data, options.entryDate, options.fetchLocation)
  if (!result) {
    throw new TidesApiError('Tide data not found', 'NOT_FOUND')
  }
  return result
}

export function tideDataHasForecastForDate(
  data: Record<string, unknown>,
  entryDate: string
): boolean {
  return hasTideTimesForDate(data, entryDate)
}
