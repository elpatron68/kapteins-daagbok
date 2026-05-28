import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { encryptJson, decryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'

export interface GpsWaypoint {
  timestamp: number
  lat: number
  lng: number
  speedKnots?: number
  heading?: number
}

let watchId: number | null = null
let wakeLock: any = null
let activeEntryId: string | null = null
let lastWaypoint: GpsWaypoint | null = null
let onWaypointAddedCallback: ((waypoint: GpsWaypoint) => void) | null = null

// Haversine formula to compute distance in meters
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Request Screen Wake Lock
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await (navigator as any).wakeLock.request('screen')
      console.log('GPS Tracker: Screen Wake Lock acquired')
    }
  } catch (err) {
    console.warn('GPS Tracker: Wake Lock request failed:', err)
  }
}

// Release Screen Wake Lock
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
      console.log('GPS Tracker: Screen Wake Lock released')
    })
  }
}

// Handle visibility changes to re-acquire wake lock if tab is minimized/restored
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (watchId !== null && document.visibilityState === 'visible') {
      await requestWakeLock()
    }
  })
}

// Start GPS Tracking Run
export async function startGpsTracking(
  logbookId: string,
  entryId: string,
  onWaypointAdded?: (waypoint: GpsWaypoint) => void
): Promise<void> {
  if (watchId !== null) {
    throw new Error('Tracking is already active')
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your device')
  }

  activeEntryId = entryId
  onWaypointAddedCallback = onWaypointAdded || null
  lastWaypoint = null

  // Acquire Screen Wake Lock to prevent standby/sleep
  await requestWakeLock()

  // Load last waypoint from existing track to resume or filter correctly
  try {
    const existingTrack = await getDecryptedGpsTrack(entryId)
    if (existingTrack && existingTrack.length > 0) {
      lastWaypoint = existingTrack[existingTrack.length - 1]
    }
  } catch (e) {
    console.warn('Could not read existing waypoints for filtering:', e)
  }

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude, speed, heading } = position.coords
      const now = Date.now()

      // Convert speed from m/s to knots (1 m/s = 1.94384 knots)
      const speedKnots = speed !== null && speed !== undefined && speed >= 0 ? speed * 1.94384 : undefined
      const headingDeg = heading !== null && heading !== undefined && heading >= 0 ? heading : undefined

      const newWaypoint: GpsWaypoint = {
        timestamp: now,
        lat: Number(latitude.toFixed(6)),
        lng: Number(longitude.toFixed(6)),
        speedKnots: speedKnots !== undefined ? Number(speedKnots.toFixed(1)) : undefined,
        heading: headingDeg !== undefined ? Number(headingDeg.toFixed(0)) : undefined
      }

      // Filter: Only add if distance to last waypoint > 15 meters OR if 30 seconds elapsed
      if (lastWaypoint) {
        const distance = getDistanceMeters(lastWaypoint.lat, lastWaypoint.lng, newWaypoint.lat, newWaypoint.lng)
        const timeElapsed = now - lastWaypoint.timestamp

        // Throttle check
        if (distance < 15 && timeElapsed < 30000) {
          // Skip insignificant waypoint
          return
        }
      }

      // Save waypoint
      try {
        await saveWaypoint(logbookId, entryId, newWaypoint)
        lastWaypoint = newWaypoint
        if (onWaypointAddedCallback) {
          onWaypointAddedCallback(newWaypoint)
        }
      } catch (err) {
        console.error('GPS Tracker: Failed to save waypoint:', err)
      }
    },
    (error) => {
      console.error('GPS Geolocation tracking error:', error)
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0
    }
  )
}

// Stop GPS Tracking Run
export function stopGpsTracking(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
  releaseWakeLock()
  activeEntryId = null
  onWaypointAddedCallback = null
  lastWaypoint = null
  console.log('GPS Tracker: Stopped tracking')
}

// Is Tracking currently running for this entry?
export function isGpsTrackingActive(entryId?: string): boolean {
  if (entryId) {
    return watchId !== null && activeEntryId === entryId
  }
  return watchId !== null
}

// Get the decrypted waypoints array for a journal entry
export async function getDecryptedGpsTrack(entryId: string): Promise<GpsWaypoint[]> {
  const masterKey = getActiveMasterKey()
  if (!masterKey) {
    throw new Error('Master key not found. Please log in.')
  }

  const record = await db.gpsTracks.get(entryId)
  if (!record) return []

  try {
    const decrypted = await decryptJson(record.encryptedData, record.iv, record.tag, masterKey)
    return Array.isArray(decrypted) ? decrypted : []
  } catch (err) {
    console.error('Failed to decrypt GPS track:', err)
    return []
  }
}

// Helper: append waypoint, encrypt, and save/queue sync
async function saveWaypoint(logbookId: string, entryId: string, waypoint: GpsWaypoint): Promise<void> {
  const masterKey = getActiveMasterKey()
  if (!masterKey) throw new Error('Master key not found. Please log in.')

  // Fetch current waypoints
  const waypoints = await getDecryptedGpsTrack(entryId)
  waypoints.push(waypoint)

  // Encrypt array
  const encrypted = await encryptJson(waypoints, masterKey)
  const now = new Date().toISOString()

  // Save to Dexie
  await db.gpsTracks.put({
    entryId,
    logbookId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: now
  })

  // Add to Sync queue (payloadId is entryId here)
  await db.syncQueue.put({
    action: 'create', // upsert mapping is used on server
    type: 'gpsTrack',
    payloadId: entryId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  // Trigger sync
  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

// Generate GPX file contents from Waypoints
export function generateGpxString(waypoints: GpsWaypoint[], dateStr: string): string {
  const trkpts = waypoints
    .map((wp) => {
      const timeISO = new Date(wp.timestamp).toISOString()
      const courseTag = wp.heading !== undefined ? `<course>${wp.heading}</course>` : ''
      const speedTag = wp.speedKnots !== undefined ? `<speed>${(wp.speedKnots / 1.94384).toFixed(2)}</speed>` : '' // speed back in m/s for GPX spec
      return `        <trkpt lat="${wp.lat}" lon="${wp.lng}">
          <time>${timeISO}</time>
          ${courseTag}
          ${speedTag}
        </trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kapteins Daagbox" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Track Log ${dateStr}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}

// Download GPX file client-side
export function downloadGpxFile(waypoints: GpsWaypoint[], dateStr: string): void {
  if (waypoints.length === 0) {
    alert('No waypoints recorded to export.')
    return
  }
  const gpxContent = generateGpxString(waypoints, dateStr)
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `track_${dateStr.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gpx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
