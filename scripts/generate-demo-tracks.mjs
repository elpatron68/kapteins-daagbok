#!/usr/bin/env node
/**
 * Generates demo GPX tracks (Laboe→Damp, Damp→Schleimünde) in Kapteins Daagbok format.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../client/src/assets/demo')

const NM_IN_METERS = 1852

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function generateTrack({ name, desc, start, end, distanceNm, startTime, avgSpeedKn = 4.5 }) {
  const totalM = distanceNm * NM_IN_METERS
  const numPoints = Math.max(40, Math.round(distanceNm * 25))
  const course = bearingDeg(start.lat, start.lon, end.lat, end.lon)
  const durationSec = (distanceNm / avgSpeedKn) * 3600
  const startMs = new Date(startTime).getTime()

  const points = []
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1)
    const lat = start.lat + (end.lat - start.lat) * t
    const lon = start.lon + (end.lon - start.lon) * t
    const ts = new Date(startMs + durationSec * t * 1000).toISOString()
    const speedMs = (avgSpeedKn / 1.94384) * (0.85 + 0.3 * Math.sin(i * 0.4))
    points.push({ lat, lon, ts, speedMs, course })
  }

  // Rescale last segment to hit target distance approximately
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    acc += haversineMeters(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
  }
  const scale = totalM / acc
  const adjusted = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const prev = adjusted[i - 1]
    const raw = points[i]
    const seg = haversineMeters(prev.lat, prev.lon, raw.lat, raw.lon) * scale
    const bearing = bearingDeg(prev.lat, prev.lon, raw.lat, raw.lon)
    const R = 6371000
    const br = (bearing * Math.PI) / 180
    const lat1 = (prev.lat * Math.PI) / 180
    const lon1 = (prev.lon * Math.PI) / 180
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(seg / R) + Math.cos(lat1) * Math.sin(seg / R) * Math.cos(br)
    )
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(br) * Math.sin(seg / R) * Math.cos(lat1),
        Math.cos(seg / R) - Math.sin(lat1) * Math.sin(lat2)
      )
    adjusted.push({
      lat: (lat2 * 180) / Math.PI,
      lon: (lon2 * 180) / Math.PI,
      ts: raw.ts,
      speedMs: raw.speedMs,
      course: raw.course
    })
  }
  adjusted[adjusted.length - 1] = { ...adjusted.at(-1), lat: end.lat, lon: end.lon }

  const trkpts = adjusted
    .map(
      (p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">
        <time>${p.ts}</time>
        <ele>1.0</ele>
        <speed>${p.speedMs.toFixed(3)}</speed>
        <course>${p.course.toFixed(1)}</course>
      </trkpt>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kapteins Daagbok Demo" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <desc>${desc}</desc>
    <time>${startTime}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <type>sailing</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`
}

mkdirSync(outDir, { recursive: true })

const laboeDamp = generateTrack({
  name: 'Laboe → Damp',
  desc: 'Demo track Laboe to Damp, ~8 sm',
  start: { lat: 54.397929, lon: 10.224316 },
  end: { lat: 54.455, lon: 10.729 },
  distanceNm: 8,
  startTime: '2026-05-30T09:00:00Z',
  avgSpeedKn: 4.2
})

const dampSchleimuende = generateTrack({
  name: 'Damp → Schleimünde',
  desc: 'Demo track Damp to Schleimünde, ~12 sm',
  start: { lat: 54.455, lon: 10.729 },
  end: { lat: 54.493, lon: 9.933 },
  distanceNm: 12,
  startTime: '2026-05-31T08:30:00Z',
  avgSpeedKn: 4.8
})

writeFileSync(join(outDir, 'laboe-damp.gpx'), laboeDamp, 'utf8')
writeFileSync(join(outDir, 'damp-schleimuende.gpx'), dampSchleimuende, 'utf8')
console.log('Wrote laboe-damp.gpx and damp-schleimuende.gpx to', outDir)
