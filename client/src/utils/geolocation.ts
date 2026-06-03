const MPS_TO_KNOTS = 1.9438444924406

/** Extra ms beyond the native timeout so hung browsers still reject. */
const TIMEOUT_GRACE_MS = 750

/** Estimated fix quality from browser accuracy (metres). Real satellite count is not exposed to web apps. */
export type GpsSignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

export interface GeoCoordinates {
  lat: string
  lng: string
  /** SOG from GPS when available (kn), otherwise null. */
  speedKn: number | null
  /** Estimated horizontal accuracy in metres, when reported by the browser. */
  accuracyM: number | null
  /** Derived signal quality indicator for UI hints. */
  signalQuality: GpsSignalQuality
}

/** Classifies GPS fix quality from reported accuracy (lower metres = better). */
export function classifyGpsAccuracyMeters(accuracyM: number | null | undefined): GpsSignalQuality {
  if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM < 0) return 'unknown'
  if (accuracyM <= 15) return 'excellent'
  if (accuracyM <= 40) return 'good'
  if (accuracyM <= 100) return 'fair'
  return 'poor'
}

export function gpsQualityI18nKey(quality: GpsSignalQuality): string {
  return `logs.gps_quality_${quality}`
}

export function formatGpsAccuracyMeters(accuracyM: number): string {
  return accuracyM < 100 ? String(Math.round(accuracyM)) : String(Math.round(accuracyM))
}

export type GeolocationPermissionState = PermissionState | 'unsupported'

export type GeolocationErrorReason =
  | 'unavailable'
  | 'timeout'
  | 'permission_denied'
  | 'position_unavailable'
  | 'unknown'

/** Maps browser / wrapper errors to a stable reason for i18n. */
export function getGeolocationErrorReason(error: unknown): GeolocationErrorReason {
  if (error instanceof Error) {
    if (error.message === 'geolocation_unavailable') return 'unavailable'
    if (error.message === 'geolocation_timeout') return 'timeout'
  }
  const code = (error as GeolocationPositionError | undefined)?.code
  if (code === 1) return 'permission_denied'
  if (code === 2) return 'position_unavailable'
  if (code === 3) return 'timeout'
  return 'unknown'
}

/** i18n key (full path, e.g. logs.gps_timeout) for a geolocation failure reason. */
export function geolocationErrorI18nKey(reason: GeolocationErrorReason): string {
  switch (reason) {
    case 'unavailable':
      return 'logs.gps_unavailable'
    case 'timeout':
      return 'logs.gps_timeout'
    case 'permission_denied':
      return 'logs.gps_permission_denied'
    case 'position_unavailable':
      return 'logs.gps_position_unavailable'
    default:
      return 'logs.gps_failed'
  }
}

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

/** localStorage: user has seen the Live-Log geolocation intro (allow or dismiss). */
export const GEOLOCATION_LIVE_INTRO_STORAGE_KEY = 'kdb_geolocation_live_intro_seen'

export function hasSeenGeolocationLiveIntro(): boolean {
  try {
    return localStorage.getItem(GEOLOCATION_LIVE_INTRO_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markGeolocationLiveIntroSeen(): void {
  try {
    localStorage.setItem(GEOLOCATION_LIVE_INTRO_STORAGE_KEY, '1')
  } catch {
    // Private mode / quota — non-fatal
  }
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
  const accuracyM = pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
    ? pos.coords.accuracy
    : null
  return {
    lat: pos.coords.latitude.toFixed(6),
    lng: pos.coords.longitude.toFixed(6),
    speedKn,
    accuracyM,
    signalQuality: classifyGpsAccuracyMeters(accuracyM)
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
