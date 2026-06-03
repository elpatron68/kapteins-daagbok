import { useTranslation } from 'react-i18next'
import { Signal } from 'lucide-react'
import {
  formatGpsAccuracyMeters,
  gpsQualityI18nKey,
  type GpsSignalQuality
} from '../utils/geolocation.js'

const SIGNAL_BARS: Record<GpsSignalQuality, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  unknown: 0
}

interface GpsSignalHintProps {
  quality: GpsSignalQuality
  accuracyM: number | null
  className?: string
}

export default function GpsSignalHint({ quality, accuracyM, className = '' }: GpsSignalHintProps) {
  const { t } = useTranslation()
  const bars = SIGNAL_BARS[quality]
  const i18nParams = accuracyM != null ? { accuracy: formatGpsAccuracyMeters(accuracyM) } : undefined

  return (
    <p
      className={`gps-signal-hint gps-signal-${quality} ${className}`.trim()}
      role="status"
    >
      <span className="gps-signal-hint-label">
        <Signal size={14} aria-hidden className="gps-signal-icon" />
        <span className="gps-signal-bars" aria-hidden>
          {[1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={`gps-signal-bar ${level <= bars ? 'is-active' : ''}`}
            />
          ))}
        </span>
        <span>{t(gpsQualityI18nKey(quality), i18nParams)}</span>
      </span>
    </p>
  )
}
