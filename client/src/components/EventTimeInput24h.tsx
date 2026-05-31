import { useId, useMemo } from 'react'
import { joinTimeHHMM, splitTimeHHMM } from '../utils/logEntryPayload.js'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface EventTimeInput24hProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  'aria-label'?: string
}

export default function EventTimeInput24h({
  value,
  onChange,
  disabled = false,
  'aria-label': ariaLabel
}: EventTimeInput24hProps) {
  const baseId = useId()
  const { hours, minutes } = useMemo(() => splitTimeHHMM(value), [value])

  return (
    <div className="time-input-24h">
      <select
        id={`${baseId}-hours`}
        className="input-text time-input-24h__select"
        value={hours}
        onChange={(e) => onChange(joinTimeHHMM(e.target.value, minutes))}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} (h)` : undefined}
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <span className="time-input-24h__sep" aria-hidden="true">
        :
      </span>
      <select
        id={`${baseId}-minutes`}
        className="input-text time-input-24h__select"
        value={minutes}
        onChange={(e) => onChange(joinTimeHHMM(hours, e.target.value))}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} (min)` : undefined}
      >
        {MINUTES.map((minute) => (
          <option key={minute} value={minute}>
            {minute}
          </option>
        ))}
      </select>
    </div>
  )
}
