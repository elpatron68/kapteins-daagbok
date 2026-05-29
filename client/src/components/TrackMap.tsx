import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import type { TrackWaypoint } from '../services/trackUpload.js'

interface TrackMapProps {
  waypoints: TrackWaypoint[]
}

export default function TrackMap({ waypoints }: TrackMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<{
    polyline: L.Polyline | null
    start: L.CircleMarker | null
    end: L.CircleMarker | null
  }>({ polyline: null, start: null, end: null })

  const waypointsKey = useMemo(
    () => waypoints.map((wp) => `${wp.lat},${wp.lng}`).join('|'),
    [waypoints]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true
    })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map)

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: 'Map data &copy; <a href="http://openseamap.org">OpenSeaMap</a> contributors'
    }).addTo(map)

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 150)

    return () => {
      window.clearTimeout(resizeTimer)
      map.remove()
      mapRef.current = null
      layersRef.current = { polyline: null, start: null, end: null }
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || waypoints.length === 0) return

    const { polyline, start, end } = layersRef.current
    polyline?.remove()
    start?.remove()
    end?.remove()

    const latLngs = waypoints.map((wp) => [wp.lat, wp.lng] as [number, number])

    const newPolyline = L.polyline(latLngs, {
      color: '#fbbf24',
      weight: 4,
      opacity: 0.85
    }).addTo(map)

    const newStart = L.circleMarker(latLngs[0], {
      radius: 8,
      fillColor: '#10b981',
      fillOpacity: 0.9,
      color: '#ffffff',
      weight: 2
    })
      .addTo(map)
      .bindPopup(t('logs.track_map_start'))

    let newEnd: L.CircleMarker | null = null
    if (waypoints.length > 1) {
      newEnd = L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 8,
        fillColor: '#ef4444',
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 2
      })
        .addTo(map)
        .bindPopup(t('logs.track_map_end'))
    }

    layersRef.current = { polyline: newPolyline, start: newStart, end: newEnd }
    map.fitBounds(newPolyline.getBounds(), { padding: [20, 20] })

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 100)
    return () => window.clearTimeout(resizeTimer)
  }, [waypointsKey, waypoints, t])

  if (!waypoints.length) return null

  return (
    <div
      className="track-map-container"
      ref={containerRef}
      aria-label={t('logs.track_map_title')}
    />
  )
}
