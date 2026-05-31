const MPS_TO_KNOTS = 1.9438444924406

export interface GeoCoordinates {
  lat: string
  lng: string
  /** SOG from GPS when available (kn), otherwise null. */
  speedKn: number | null
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
