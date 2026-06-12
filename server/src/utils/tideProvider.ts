import { fetchBshTidesForCoordinates, MAX_BSH_DISTANCE_KM } from './bshTides.js'
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

export async function fetchTidesForPlace(query: string): Promise<TideProviderResult> {
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
