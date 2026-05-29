import { Component, useEffect, useMemo, useRef } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import type { TrackWaypoint } from '../services/trackUpload.js'
import {
  getSegmentSpeedsKn,
  getTrackLineColor,
  hasSpeedGradientData,
  speedToTrackColor
} from '../utils/trackMapColors.js'

interface TrackMapProps {
  waypoints: TrackWaypoint[]
}

const LINE_WEIGHT = 5
const LINE_OPACITY = 0.92

function isValidWaypoint(wp: TrackWaypoint): boolean {
  return Number.isFinite(Number(wp.lat)) && Number.isFinite(Number(wp.lng))
}

function toLatLngs(waypoints: TrackWaypoint[]): [number, number][] {
  return waypoints
    .filter(isValidWaypoint)
    .map((wp) => [Number(wp.lat), Number(wp.lng)] as [number, number])
}

function getTrackCenter(latLngs: [number, number][]): [number, number] {
  const avgLat = latLngs.reduce((sum, point) => sum + point[0], 0) / latLngs.length
  const avgLng = latLngs.reduce((sum, point) => sum + point[1], 0) / latLngs.length
  return [avgLat, avgLng]
}

function scheduleFitMap(
  map: L.Map,
  latLngs: [number, number][],
  isCancelled: () => boolean,
  frameIds: number[]
) {
  if (latLngs.length === 0) return

  const fallbackCenter = latLngs.length === 1 ? latLngs[0] : getTrackCenter(latLngs)
  const fallbackZoom = latLngs.length === 1 ? 14 : 11

  frameIds.push(
    requestAnimationFrame(() => {
      if (isCancelled()) return
      map.invalidateSize({ animate: false })
      frameIds.push(
        requestAnimationFrame(() => {
          if (isCancelled()) return
          try {
            if (latLngs.length === 1) {
              map.setView(L.latLng(latLngs[0]), 14, { animate: false })
              return
            }

            const bounds = L.latLngBounds(latLngs.map(([lat, lng]) => L.latLng(lat, lng)))
            if (!bounds.isValid()) {
              map.setView(fallbackCenter, fallbackZoom, { animate: false })
              return
            }

            map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14, animate: false })
          } catch {
            map.setView(fallbackCenter, fallbackZoom, { animate: false })
          }
        })
      )
    })
  )
}

function TrackMapInner({ waypoints }: TrackMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)

  const validWaypoints = useMemo(() => waypoints.filter(isValidWaypoint), [waypoints])
  const segmentSpeeds = useMemo(() => getSegmentSpeedsKn(validWaypoints), [validWaypoints])
  const useGradient = hasSpeedGradientData(segmentSpeeds)

  const speedRange = useMemo(() => {
    const valid = segmentSpeeds.filter((speed) => speed > 0)
    if (valid.length === 0) return { min: 0, max: 0 }
    return { min: Math.min(...valid), max: Math.max(...valid) }
  }, [segmentSpeeds])

  const trackKey = useMemo(
    () =>
      validWaypoints
        .map((wp, index) => {
          const speed = index > 0 ? segmentSpeeds[index - 1] : 0
          return `${wp.lat},${wp.lng},${speed.toFixed(1)}`
        })
        .join('|'),
    [validWaypoints, segmentSpeeds]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || validWaypoints.length === 0) return

    let cancelled = false
    const pendingFrames: number[] = []
    const isCancelled = () => cancelled

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
    const latLngs = toLatLngs(validWaypoints)

    if (useGradient && latLngs.length >= 2) {
      for (let i = 1; i < latLngs.length; i++) {
        const speedKn = segmentSpeeds[i - 1] ?? 0
        const color = speedToTrackColor(speedKn, speedRange.min, speedRange.max)
        L.polyline([latLngs[i - 1], latLngs[i]], {
          color,
          weight: LINE_WEIGHT,
          opacity: LINE_OPACITY,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(trackGroup)
      }
    } else if (latLngs.length >= 2) {
      L.polyline(latLngs, {
        color: getTrackLineColor(segmentSpeeds),
        weight: LINE_WEIGHT,
        opacity: LINE_OPACITY,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(trackGroup)
    }

    if (latLngs.length > 0) {
      L.circleMarker(latLngs[0], {
        radius: 8,
        fillColor: '#10b981',
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 2
      })
        .addTo(trackGroup)
        .bindPopup(t('logs.track_map_start'))
    }

    if (latLngs.length > 1) {
      L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 8,
        fillColor: '#ef4444',
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 2
      })
        .addTo(trackGroup)
        .bindPopup(t('logs.track_map_end'))
    }

    scheduleFitMap(map, latLngs, isCancelled, pendingFrames)

    return () => {
      cancelled = true
      pendingFrames.forEach((id) => cancelAnimationFrame(id))
      map.remove()
    }
  }, [trackKey, validWaypoints, segmentSpeeds, speedRange.min, speedRange.max, useGradient, t])

  if (validWaypoints.length === 0) return null

  return (
    <div className="track-map-wrapper">
      <div
        className="track-map-container"
        ref={containerRef}
        aria-label={t('logs.track_map_title')}
      />
      {useGradient && (
        <div className="track-map-legend" aria-hidden="true">
          <span>{t('logs.track_map_speed_slow')}</span>
          <div className="track-map-legend-bar" />
          <span>{t('logs.track_map_speed_fast')}</span>
        </div>
      )}
    </div>
  )
}

class TrackMapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TrackMap render failed:', error, info)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export default function TrackMap(props: TrackMapProps) {
  const { t } = useTranslation()
  const remountKey = props.waypoints.filter(isValidWaypoint).length

  return (
    <TrackMapErrorBoundary
      key={remountKey}
      fallback={<div className="track-error-msg">{t('logs.track_map_error')}</div>}
    >
      <TrackMapInner {...props} />
    </TrackMapErrorBoundary>
  )
}
