import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { encryptJson, decryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'

export interface GpsWaypoint {
  timestamp: number
  lat: number
  lng: number
  speedKnots?: number
  heading?: number
}

export interface SavedGpsTrack {
  waypoints: GpsWaypoint[]
  gpxContent: string // Holds the raw text file content (GPX, KML or GeoJSON)
  filename: string
  fileType: string // 'gpx' | 'kml' | 'geojson'
}

// Get the decrypted track data for a journal entry (with legacy array format compatibility)
export async function getDecryptedGpsTrack(entryId: string): Promise<SavedGpsTrack | null> {
  const record = await db.gpsTracks.get(entryId)
  if (!record) return null

  const logbookId = record.logbookId
  const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
  if (!masterKey) {
    throw new Error('Encryption key not found. Please log in.')
  }

  try {
    const decrypted = await decryptJson(record.encryptedData, record.iv, record.tag, masterKey)
    if (Array.isArray(decrypted)) {
      // Legacy format (just coordinate array)
      return {
        waypoints: decrypted,
        gpxContent: generateLegacyGpxString(decrypted, 'legacy'),
        filename: 'track_legacy.gpx',
        fileType: 'gpx'
      }
    }
    return decrypted
  } catch (err) {
    console.error('Failed to decrypt GPS track:', err)
    return null
  }
}

// Encrypt and save uploaded GPS track to local Dexie and remote sync
export async function saveUploadedGpsTrack(
  logbookId: string,
  entryId: string,
  gpxContent: string,
  waypoints: GpsWaypoint[],
  filename: string,
  fileType: string
): Promise<void> {
  const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
  if (!masterKey) throw new Error('Encryption key not found. Please log in.')

  const trackData: SavedGpsTrack = {
    waypoints,
    gpxContent,
    filename,
    fileType
  }

  // Encrypt JSON
  const encrypted = await encryptJson(trackData, masterKey)
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

  // Add to Sync queue (payloadId is entryId)
  await db.syncQueue.put({
    action: 'create',
    type: 'gpsTrack',
    payloadId: entryId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  // Trigger sync
  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

// Delete GPS track from local DB and sync queue
export async function deleteGpsTrack(logbookId: string, entryId: string): Promise<void> {
  const now = new Date().toISOString()

  // Delete from Dexie
  await db.gpsTracks.delete(entryId)

  // Add to Sync queue
  await db.syncQueue.put({
    action: 'delete',
    type: 'gpsTrack',
    payloadId: entryId,
    logbookId,
    data: '',
    updatedAt: now
  })

  // Trigger sync
  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

// Download the track file exactly as uploaded
export function downloadTrackFile(track: SavedGpsTrack): void {
  const blob = new Blob([track.gpxContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = track.filename || 'track.gpx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Main parser entry point
export function parseTrackFile(text: string, filename: string): { waypoints: GpsWaypoint[]; type: string } {
  const lowerName = filename.toLowerCase()
  if (lowerName.endsWith('.kml') || text.includes('<kml')) {
    return { waypoints: parseKmlFile(text), type: 'kml' }
  } else if (lowerName.endsWith('.json') || lowerName.endsWith('.geojson') || text.trim().startsWith('{')) {
    return { waypoints: parseGeoJsonFile(text), type: 'geojson' }
  } else {
    return { waypoints: parseGpxFile(text), type: 'gpx' }
  }
}

// 1. GPX Parser
export function parseGpxFile(gpxText: string): GpsWaypoint[] {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(gpxText, 'text/xml')
  const trackPoints = xmlDoc.getElementsByTagName('trkpt')
  const waypoints: GpsWaypoint[] = []

  for (let i = 0; i < trackPoints.length; i++) {
    const el = trackPoints[i]
    const lat = parseFloat(el.getAttribute('lat') || '')
    const lon = parseFloat(el.getAttribute('lon') || '')
    if (isNaN(lat) || isNaN(lon)) continue

    const timeEl = el.getElementsByTagName('time')[0]
    const timestamp = timeEl && timeEl.textContent ? new Date(timeEl.textContent).getTime() : Date.now()

    const speedEl = el.getElementsByTagName('speed')[0]
    const speedKnots = speedEl && speedEl.textContent ? parseFloat(speedEl.textContent) * 1.94384 : undefined

    const courseEl = el.getElementsByTagName('course')[0] || el.getElementsByTagName('heading')[0]
    const heading = courseEl && courseEl.textContent ? parseFloat(courseEl.textContent) : undefined

    waypoints.push({
      timestamp,
      lat: Number(lat.toFixed(6)),
      lng: Number(lon.toFixed(6)),
      speedKnots: speedKnots !== undefined && !isNaN(speedKnots) ? Number(speedKnots.toFixed(1)) : undefined,
      heading: heading !== undefined && !isNaN(heading) ? Number(heading.toFixed(0)) : undefined
    })
  }
  return waypoints
}

// 2. KML Parser
export function parseKmlFile(kmlText: string): GpsWaypoint[] {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml')
  const waypoints: GpsWaypoint[] = []

  // Check for standard KML <coordinates> tags
  const coordsTags = xmlDoc.getElementsByTagName('coordinates')
  for (let i = 0; i < coordsTags.length; i++) {
    const text = coordsTags[i].textContent || ''
    const coordStrings = text.trim().split(/\s+/)
    for (const str of coordStrings) {
      const parts = str.split(',')
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0])
        const lat = parseFloat(parts[1])
        if (!isNaN(lat) && !isNaN(lon)) {
          waypoints.push({
            timestamp: Date.now(),
            lat: Number(lat.toFixed(6)),
            lng: Number(lon.toFixed(6))
          })
        }
      }
    }
  }

  // Check for gx:coord extensions (commonly used in Google Earth tracks)
  const gxCoords = xmlDoc.getElementsByTagName('gx:coord')
  if (gxCoords.length > 0) {
    for (let i = 0; i < gxCoords.length; i++) {
      const text = gxCoords[i].textContent || ''
      const parts = text.trim().split(/\s+/)
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0])
        const lat = parseFloat(parts[1])
        if (!isNaN(lat) && !isNaN(lon)) {
          waypoints.push({
            timestamp: Date.now(),
            lat: Number(lat.toFixed(6)),
            lng: Number(lon.toFixed(6))
          })
        }
      }
    }
  }

  return waypoints
}

// 3. GeoJSON Parser
export function parseGeoJsonFile(geoJsonText: string): GpsWaypoint[] {
  const waypoints: GpsWaypoint[] = []
  try {
    const data = JSON.parse(geoJsonText)

    const processGeometry = (geom: any) => {
      if (!geom) return
      if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
        for (const coord of geom.coordinates) {
          const lon = coord[0]
          const lat = coord[1]
          if (typeof lat === 'number' && typeof lon === 'number') {
            waypoints.push({
              timestamp: Date.now(),
              lat: Number(lat.toFixed(6)),
              lng: Number(lon.toFixed(6))
            })
          }
        }
      } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
        for (const line of geom.coordinates) {
          if (Array.isArray(line)) {
            for (const coord of line) {
              const lon = coord[0]
              const lat = coord[1]
              if (typeof lat === 'number' && typeof lon === 'number') {
                waypoints.push({
                  timestamp: Date.now(),
                  lat: Number(lat.toFixed(6)),
                  lng: Number(lon.toFixed(6))
                })
              }
            }
          }
        }
      }
    };

    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      for (const feature of data.features) {
        if (feature && feature.geometry) {
          processGeometry(feature.geometry)
        }
      }
    } else if (data.type === 'Feature' && data.geometry) {
      processGeometry(data.geometry)
    } else if (data.type === 'LineString' || data.type === 'MultiLineString') {
      processGeometry(data)
    }
  } catch (err) {
    console.error('Failed to parse GeoJSON track:', err)
  }

  return waypoints
}

// Generate legacy fallback GPX string
function generateLegacyGpxString(waypoints: GpsWaypoint[], dateStr: string): string {
  const trkpts = waypoints
    .map((wp) => {
      const timeISO = new Date(wp.timestamp).toISOString()
      return `        <trkpt lat="${wp.lat}" lon="${wp.lng}">
          <time>${timeISO}</time>
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
