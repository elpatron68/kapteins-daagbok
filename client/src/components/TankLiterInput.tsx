import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { clampTankLiters } from '../utils/tankCapacity.js'
import { formatTankLiters, parseAppDecimalOrZero } from '../utils/numberFormat.js'

interface TankLiterInputProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  maxLiters?: number
  disabled?: boolean
  titleTooltip?: string
}

function parseInputLiters(value: string): number {
  if (!value.trim()) return 0
  return parseAppDecimalOrZero(value)
}

export default function TankLiterInput({
  id,
  label,
  value,
  onChange,
  maxLiters,
  disabled = false,
  titleTooltip
}: TankLiterInputProps) {
  const { t } = useTranslation()
  const useSlider = maxLiters != null && maxLiters > 0

  const emitValue = useCallback(
    (liters: number) => {
      const clamped = clampTankLiters(liters, useSlider ? maxLiters : undefined)
      const str = formatTankLiters(clamped)
      onChange(str)
    },
    [onChange, maxLiters, useSlider]
  )

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  const handleNumberBlur = () => {
    if (!useSlider) return
    emitValue(parseInputLiters(value))
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    emitValue(Number(e.target.value))
  }

  const numericValue = parseInputLiters(value)
  const sliderValue = useSlider ? clampTankLiters(numericValue, maxLiters) : 0

  return (
    <div className="input-group tank-liter-input">
      <label htmlFor={id} title={titleTooltip}>{label}</label>
      {useSlider && (
        <>
          <input
            type="range"
            className="tank-liter-slider"
            min={0}
            max={maxLiters}
            step={1}
            value={sliderValue}
            onChange={handleSliderChange}
            disabled={disabled}
            title={titleTooltip}
            aria-valuemin={0}
            aria-valuemax={maxLiters}
            aria-valuenow={sliderValue}
            aria-label={label}
          />
          <div className="tank-liter-slider-hint" aria-hidden="true">
            {t('logs.tank_slider_of_max', {
              current: sliderValue,
              max: maxLiters
            })}
          </div>
        </>
      )}
      <input
        id={id}
        type="number"
        className="input-text"
        value={value}
        onChange={handleNumberChange}
        onBlur={handleNumberBlur}
        disabled={disabled}
        min={0}
        max={useSlider ? maxLiters : undefined}
        step="any"
        title={titleTooltip}
      />
    </div>
  )
}
