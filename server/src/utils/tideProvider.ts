import {
  fetchBshTidesForCoordinates,
  fetchBshTidesForStation,
  listNearbyBshStations,
  loadBshStationIndex,
  MAX_BSH_DISTANCE_KM,
  type BshStationSuggestion
} from './bshTides.js'
import {
  fetchTidesForCoordinates as fetchOpenMeteoTidesForCoordinates,
  fetchTidesForPlace as fetchOpenMeteoTidesForPlace,
  geocodePlace,
  type TideLookupResult
} from './openMeteoTides.js'

export type TideProviderResult = TideLookupResult & {
  distanceKm?: number
  fallback?: 'open_meteo'
}

export async function fetchTidesForCoordinates(
  lat: number,
  lon: number,
  options?: { name?: string; source?: 'coordinates' | 'geocoded' }
): Promise<TideProviderResult> {
  try {
    const bsh = await fetchBshTidesForCoordinates(lat, lon)
    return bsh
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    const tooFar = message === 'bsh_station_too_far'
    const noStation = message === 'no_bsh_station' || message === 'bsh_empty_station_list'
    const noData = message === 'no_tide_data'

    if (!tooFar && !noStation && !noData) {
      console.warn('BSH tide lookup failed, trying Open-Meteo fallback:', error)
    }

    const fallback = await fetchOpenMeteoTidesForCoordinates(lat, lon, options)
    return {
      ...fallback,
      fallback: 'open_meteo',
      tides: {
        data: {
          ...fallback.tides.data,
          source: `${fallback.tides.data.source} (Fallback — keine BSH-Station innerhalb ${MAX_BSH_DISTANCE_KM} km)`
        }
      }
    }
  }
}

export async function listNearbyTideStations(
  lat: number,
  lon: number,
  limit = 8
): Promise<BshStationSuggestion[]> {
  try {
    return await listNearbyBshStations(lat, lon, limit)
  } catch {
    return []
  }
}

export async function fetchTidesForStation(
  stationId: string,
  options?: { queryLat?: number; queryLon?: number }
): Promise<TideProviderResult> {
  try {
    return await fetchBshTidesForStation(stationId, options)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'bsh_invalid_station' || message === 'no_tide_data') {
      throw error
    }
    console.warn('BSH station tide lookup failed:', error)
    throw new Error('no_tide_data')
  }
}

function normalizeForMatching(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/ss/g, 'ß');
}

export async function fetchTidesForPlace(query: string): Promise<TideProviderResult> {
  const normQuery = normalizeForMatching(query)
  if (normQuery) {
    try {
      const stations = await loadBshStationIndex()
      let match = stations.find(s => normalizeForMatching(s.name) === normQuery)
      if (!match) {
        match = stations.find(s => normalizeForMatching(s.name).startsWith(normQuery))
      }
      if (match) {
        console.log(`[tideProvider] Match found in BSH station index for "${query}": ${match.name} (${match.id})`)
        return await fetchTidesForStation(match.id)
      }
    } catch (err) {
      console.warn('[tideProvider] Direct BSH station lookup failed:', err)
    }
  }

  const place = await geocodePlace(query)
  if (!place) {
    if (normQuery) {
      try {
        const stations = await loadBshStationIndex()
        const match = stations.find(s => 
          normalizeForMatching(s.name).includes(normQuery) || 
          normQuery.includes(normalizeForMatching(s.name))
        )
        if (match) {
          console.log(`[tideProvider] Geocoding failed. Found fallback BSH station match for "${query}": ${match.name} (${match.id})`)
          return await fetchTidesForStation(match.id)
        }
      } catch (err) {
        console.warn('[tideProvider] Fallback BSH station lookup failed:', err)
      }
    }

    const err = new Error('place_not_found') as Error & { status?: number }
    err.status = 404
    throw err
  }

  return fetchTidesForCoordinates(place.latitude, place.longitude, {
    name: place.name,
    source: 'geocoded'
  })
}
