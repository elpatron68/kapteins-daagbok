const MPS_TO_KNOTS = 1.9438444924406

/** Extra ms beyond the native timeout so hung browsers still reject. */
const TIMEOUT_GRACE_MS = 750

export interface GeoCoordinates {
  lat: string
  lng: string
  /** SOG from GPS when available (kn), otherwise null. */
  speedKn: number | null
}

export type GeolocationPermissionState = PermissionState | 'unsupported'

export interface GetPositionOptions {
  timeoutMs?: number
  /** Manual fixes may use high accuracy; background auto-position should not. */
  enableHighAccuracy?: boolean
  maximumAge?: number
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

export async function queryGeolocationPermission(): Promise<GeolocationPermissionState> {
  if (!navigator.geolocation) return 'unsupported'
  if (!navigator.permissions?.query) return 'prompt'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'prompt'
  }
}

function normalizeGetPositionOptions(
  options: number | GetPositionOptions | undefined
): Required<GetPositionOptions> {
  const opts = typeof options === 'number' ? { timeoutMs: options } : (options ?? {})
  const enableHighAccuracy = opts.enableHighAccuracy ?? true
  return {
    timeoutMs: opts.timeoutMs ?? 15000,
    enableHighAccuracy,
    maximumAge: opts.maximumAge ?? (enableHighAccuracy ? 0 : 120_000)
  }
}

function positionFromGeolocationPosition(pos: GeolocationPosition): GeoCoordinates {
  const speedKn = pos.coords.speed != null && Number.isFinite(pos.coords.speed)
    ? Number((pos.coords.speed * MPS_TO_KNOTS).toFixed(1))
    : null
  return {
    lat: pos.coords.latitude.toFixed(6),
    lng: pos.coords.longitude.toFixed(6),
    speedKn
  }
}

/**
 * Resolves with coordinates or rejects. Uses both the native timeout and an outer
 * watchdog so desktop browsers without GPS cannot hang indefinitely.
 */
export function getCurrentPosition(
  options?: number | GetPositionOptions
): Promise<GeoCoordinates> {
  const { timeoutMs, enableHighAccuracy, maximumAge } = normalizeGetPositionOptions(options)

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation_unavailable'))
      return
    }

    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(watchdog)
      fn()
    }

    const watchdog = window.setTimeout(() => {
      finish(() => reject(new Error('geolocation_timeout')))
    }, timeoutMs + TIMEOUT_GRACE_MS)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finish(() => resolve(positionFromGeolocationPosition(pos)))
      },
      (err) => {
        finish(() => reject(err))
      },
      { enableHighAccuracy, timeout: timeoutMs, maximumAge }
    )
  })
}
