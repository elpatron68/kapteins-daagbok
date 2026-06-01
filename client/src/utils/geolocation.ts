const MPS_TO_KNOTS = 1.9438444924406

export interface GeoCoordinates {
  lat: string
  lng: string
  /** SOG from GPS when available (kn), otherwise null. */
  speedKn: number | null
}

export function parseGpsCoordinate(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Validates lat/lng and returns normalized strings for storage, or null. */
export function normalizeGpsCoordinates(
  lat: string,
  lng: string
): { lat: string; lng: string } | null {
  const latN = parseGpsCoordinate(lat)
  const lngN = parseGpsCoordinate(lng)
  if (latN == null || lngN == null) return null
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return null
  return { lat: latN.toFixed(6), lng: lngN.toFixed(6) }
}

export function getCurrentPosition(timeoutMs = 15000): Promise<GeoCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation_unavailable'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const speedKn = pos.coords.speed != null && Number.isFinite(pos.coords.speed)
          ? Number((pos.coords.speed * MPS_TO_KNOTS).toFixed(1))
          : null
        resolve({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          speedKn
        })
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    )
  })
}
