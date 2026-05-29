import { Component, useEffect, useMemo, useRef } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import type { TrackSegment } from '../services/statsAggregation.js'
import { getTrackColor } from '../services/statsAggregation.js'
import type { TrackWaypoint } from '../services/trackUpload.js'

interface MultiTrackMapProps {
  segments: TrackSegment[]
}

const LINE_WEIGHT = 4
const LINE_OPACITY = 0.88

function isValidWaypoint(wp: TrackWaypoint): boolean {
  return Number.isFinite(Number(wp.lat)) && Number.isFinite(Number(wp.lng))
}

function toLatLngs(waypoints: TrackWaypoint[]): [number, number][] {
  return waypoints
    .filter(isValidWaypoint)
    .map((wp) => [Number(wp.lat), Number(wp.lng)] as [number, number])
}

function MultiTrackMapInner({ segments }: MultiTrackMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const segmentsKey = useMemo(
    () =>
      segments
        .map((seg) =>
          seg.waypoints
            .filter(isValidWaypoint)
            .map((wp) => `${seg.entryId}:${wp.lat},${wp.lng}`)
            .join('|')
        )
        .join('||'),
    [segments]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || segments.length === 0) return

    let cancelled = false
    const pendingFrames: number[] = []

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    }).addTo(map)

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: 'Map data &copy; <a href="http://openseamap.org">OpenSeaMap</a> contributors'
    }).addTo(map)

    const trackGroup = L.layerGroup().addTo(map)
    const allLatLngs: [number, number][] = []

    for (const segment of segments) {
      const latLngs = toLatLngs(segment.waypoints)
      if (latLngs.length < 2) continue

      allLatLngs.push(...latLngs)
      const color = getTrackColor(segment.colorIndex)

      L.polyline(latLngs, {
        color,
        weight: LINE_WEIGHT,
        opacity: LINE_OPACITY,
        lineCap: 'round',
        lineJoin: 'round'
      })
        .addTo(trackGroup)
        .bindPopup(t('stats.day_label', { day: segment.dayOfTravel }))

      L.circleMarker(latLngs[0], {
        radius: 7,
        fillColor: color,
        fillOpacity: 0.95,
        color: '#ffffff',
        weight: 2
      })
        .addTo(trackGroup)
        .bindPopup(`${t('stats.day_label', { day: segment.dayOfTravel })} – ${t('logs.track_map_start')}`)
    }

    if (allLatLngs.length > 0) {
      pendingFrames.push(
        requestAnimationFrame(() => {
          if (cancelled) return
          map.invalidateSize({ animate: false })
          pendingFrames.push(
            requestAnimationFrame(() => {
              if (cancelled) return
              try {
                const bounds = L.latLngBounds(allLatLngs.map(([lat, lng]) => L.latLng(lat, lng)))
                if (bounds.isValid()) {
                  map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12, animate: false })
                }
              } catch {
                map.setView(allLatLngs[0], 11, { animate: false })
              }
            })
          )
        })
      )
    }

    return () => {
      cancelled = true
      pendingFrames.forEach((id) => cancelAnimationFrame(id))
      map.remove()
    }
  }, [segmentsKey, segments, t])

  if (segments.length === 0) return null

  return (
    <div className="track-map-wrapper">
      <div
        className="track-map-container stats-multi-track-map"
        ref={containerRef}
        aria-label={t('stats.route_map_title')}
      />
      <div className="stats-track-legend" aria-hidden="true">
        {segments.map((seg) => (
          <span key={seg.entryId} className="stats-track-legend-item">
            <span
              className="stats-track-legend-swatch"
              style={{ backgroundColor: getTrackColor(seg.colorIndex) }}
            />
            {t('stats.day_label', { day: seg.dayOfTravel })}
          </span>
        ))}
      </div>
    </div>
  )
}

class MultiTrackMapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MultiTrackMap render failed:', error, info)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export default function MultiTrackMap(props: MultiTrackMapProps) {
  const { t } = useTranslation()

  return (
    <MultiTrackMapErrorBoundary
      fallback={<div className="track-error-msg">{t('logs.track_map_error')}</div>}
    >
      <MultiTrackMapInner {...props} />
    </MultiTrackMapErrorBoundary>
  )
}
