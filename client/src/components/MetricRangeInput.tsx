import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export interface MetricRangeInputProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  discreteValues?: readonly number[]
  parse: (value: string) => number | null
  format: (numeric: number) => string
  defaultNumeric: number
  /** Shown next to the label (current value). */
  formatDisplay: (numeric: number, unset: boolean) => string
  numberMin?: number
  numberMax?: number
  numberStep?: number | 'any'
  numberPlaceholder?: string
  allowLegacyText?: boolean
  hideNumberInput?: boolean
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export default function MetricRangeInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
  min,
  max,
  discreteValues,
  parse,
  format,
  defaultNumeric,
  formatDisplay,
  numberMin,
  numberMax,
  numberStep = 'any',
  numberPlaceholder,
  allowLegacyText = false,
  hideNumberInput = false
}: MetricRangeInputProps) {
  const { t } = useTranslation()
  const unsetLabel = t('logs.weather_slider_unset', { defaultValue: '—' })

  const isLegacyText =
    allowLegacyText && value.trim() !== '' && parse(value) === null

  const emitNumeric = useCallback(
    (numeric: number) => {
      onChange(format(numeric))
    },
    [onChange, format]
  )

  const parsed = parse(value)
  const unset = parsed === null
  const sliderNumeric = unset ? defaultNumeric : parsed

  const useDiscrete = discreteValues != null && discreteValues.length > 1

  let sliderMin = 0
  let sliderMax = 0
  let sliderValue = 0

  if (useDiscrete) {
    sliderMin = 0
    sliderMax = discreteValues.length - 1
    if (unset) {
      sliderValue = 0
    } else {
      let bestIdx = 0
      let bestDiff = Math.abs(discreteValues[0] - sliderNumeric)
      for (let i = 1; i < discreteValues.length; i++) {
        const diff = Math.abs(discreteValues[i] - sliderNumeric)
        if (diff < bestDiff) {
          bestDiff = diff
          bestIdx = i
        }
      }
      sliderValue = bestIdx
    }
  } else if (min != null && max != null) {
    sliderMin = min
    sliderMax = max
    sliderValue = clamp(sliderNumeric, min, max)
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = Number(e.target.value)
    if (useDiscrete && discreteValues) {
      emitNumeric(discreteValues[clamp(idx, 0, discreteValues.length - 1)])
      return
    }
    if (min != null && max != null) {
      emitNumeric(Number(e.target.value))
    }
  }

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  const handleNumberBlur = () => {
    const next = parse(value)
    if (next == null) {
      if (!value.trim()) onChange('')
      return
    }
    onChange(format(next))
  }

  const hintNumeric = useDiscrete && discreteValues
    ? discreteValues[sliderValue]
    : sliderValue

  const displayLabel = unset ? unsetLabel : formatDisplay(hintNumeric, false)

  if (isLegacyText) {
    return (
      <div className="input-group metric-range-input metric-range-input--compact">
        <div className="metric-range-header">
          <label htmlFor={id}>{label}</label>
        </div>
        <input
          id={id}
          type="text"
          className="input-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={numberPlaceholder}
        />
      </div>
    )
  }

  const hasSlider = useDiscrete || (min != null && max != null)

  return (
    <div className="input-group metric-range-input metric-range-input--compact">
      <div className="metric-range-header">
        <label htmlFor={hideNumberInput ? undefined : id}>{label}</label>
        {hasSlider && (
          <span className="metric-range-value" aria-live="polite">
            {displayLabel}
          </span>
        )}
      </div>
      {hasSlider && (
        <div className="metric-range-control-row">
          <input
            type="range"
            className="tank-liter-slider metric-range-slider"
            min={sliderMin}
            max={sliderMax}
            step={1}
            value={sliderValue}
            onChange={handleSliderChange}
            disabled={disabled}
            aria-valuemin={sliderMin}
            aria-valuemax={sliderMax}
            aria-valuenow={sliderValue}
            aria-label={label}
            aria-valuetext={displayLabel}
          />
          {!hideNumberInput && (
            <input
              id={id}
              type="number"
              className="input-text metric-range-number"
              value={unset ? '' : value.replace(/\s*hPa\s*$/i, '').replace(/°\s*$/, '')}
              onChange={handleNumberChange}
              onBlur={handleNumberBlur}
              disabled={disabled}
              min={numberMin}
              max={numberMax}
              step={numberStep}
              placeholder={numberPlaceholder}
              inputMode="decimal"
              aria-label={label}
            />
          )}
        </div>
      )}
    </div>
  )
}
