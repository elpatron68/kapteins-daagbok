import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { encryptJson, decryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'

export interface TrackWaypoint {
  timestamp: number
  lat: number
  lng: number
  speedKnots?: number
  heading?: number
}

export interface SavedTrack {
  waypoints: TrackWaypoint[]
  gpxContent: string
  filename: string
  fileType: string
}

export async function getDecryptedTrack(entryId: string): Promise<SavedTrack | null> {
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
      return {
        waypoints: decrypted,
        gpxContent: buildLegacyGpx(decrypted, 'legacy'),
        filename: 'track_legacy.gpx',
        fileType: 'gpx'
      }
    }
    return decrypted as SavedTrack
  } catch (err) {
    console.error('Failed to decrypt track file:', err)
    return null
  }
}

export async function saveUploadedTrack(
  logbookId: string,
  entryId: string,
  fileContent: string,
  waypoints: TrackWaypoint[],
  filename: string,
  fileType: string
): Promise<void> {
  const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
  if (!masterKey) throw new Error('Encryption key not found. Please log in.')

  const trackData: SavedTrack = {
    waypoints,
    gpxContent: fileContent,
    filename,
    fileType
  }

  const encrypted = await encryptJson(trackData, masterKey)
  const now = new Date().toISOString()

  await db.gpsTracks.put({
    entryId,
    logbookId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: now
  })

  await db.syncQueue.put({
    action: 'create',
    type: 'gpsTrack',
    payloadId: entryId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

export async function deleteTrack(logbookId: string, entryId: string): Promise<void> {
  const now = new Date().toISOString()

  await db.gpsTracks.delete(entryId)

  await db.syncQueue.put({
    action: 'delete',
    type: 'gpsTrack',
    payloadId: entryId,
    logbookId,
    data: '',
    updatedAt: now
  })

  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

export function downloadTrackFile(track: SavedTrack): void {
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

export function parseTrackFile(text: string, filename: string): { waypoints: TrackWaypoint[]; type: string } {
  const lowerName = filename.toLowerCase()
  if (lowerName.endsWith('.kml') || text.includes('<kml')) {
    return { waypoints: parseKmlFile(text), type: 'kml' }
  }
  if (lowerName.endsWith('.json') || lowerName.endsWith('.geojson') || text.trim().startsWith('{')) {
    return { waypoints: parseGeoJsonFile(text), type: 'geojson' }
  }
  return { waypoints: parseGpxFile(text), type: 'gpx' }
}

function parseGpxFile(gpxText: string): TrackWaypoint[] {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(gpxText, 'text/xml')
  const trackPoints = xmlDoc.getElementsByTagName('trkpt')
  const waypoints: TrackWaypoint[] = []

  for (let i = 0; i < trackPoints.length; i++) {
    const el = trackPoints[i]
    const lat = parseFloat(el.getAttribute('lat') || '')
    const lon = parseFloat(el.getAttribute('lon') || '')
    if (isNaN(lat) || isNaN(lon)) continue

    const timeEl = el.getElementsByTagName('time')[0]
    const timestamp = timeEl?.textContent ? new Date(timeEl.textContent).getTime() : Date.now()

    const speedEl = el.getElementsByTagName('speed')[0]
    const speedKnots = speedEl?.textContent ? parseFloat(speedEl.textContent) * 1.94384 : undefined

    const courseEl = el.getElementsByTagName('course')[0] || el.getElementsByTagName('heading')[0]
    const heading = courseEl?.textContent ? parseFloat(courseEl.textContent) : undefined

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

function parseKmlFile(kmlText: string): TrackWaypoint[] {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml')
  const waypoints: TrackWaypoint[] = []

  const coordsTags = xmlDoc.getElementsByTagName('coordinates')
  for (let i = 0; i < coordsTags.length; i++) {
    const text = coordsTags[i].textContent || ''
    for (const str of text.trim().split(/\s+/)) {
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

  const gxCoords = xmlDoc.getElementsByTagName('gx:coord')
  for (let i = 0; i < gxCoords.length; i++) {
    const parts = (gxCoords[i].textContent || '').trim().split(/\s+/)
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

  return waypoints
}

function parseGeoJsonFile(geoJsonText: string): TrackWaypoint[] {
  const waypoints: TrackWaypoint[] = []
  try {
    const data = JSON.parse(geoJsonText)

    const processGeometry = (geom: any) => {
      if (!geom) return
      if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
        for (const coord of geom.coordinates) {
          pushCoord(waypoints, coord)
        }
      } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
        for (const line of geom.coordinates) {
          if (Array.isArray(line)) {
            for (const coord of line) {
              pushCoord(waypoints, coord)
            }
          }
        }
      }
    }

    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      for (const feature of data.features) {
        if (feature?.geometry) processGeometry(feature.geometry)
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

function pushCoord(waypoints: TrackWaypoint[], coord: number[]) {
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

function buildLegacyGpx(waypoints: TrackWaypoint[], dateStr: string): string {
  const trkpts = waypoints
    .map((wp) => {
      const timeISO = new Date(wp.timestamp).toISOString()
      return `        <trkpt lat="${wp.lat}" lon="${wp.lng}">
          <time>${timeISO}</time>
        </trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kapteins Daagbok" xmlns="http://www.topografix.com/GPX/1/1">
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
