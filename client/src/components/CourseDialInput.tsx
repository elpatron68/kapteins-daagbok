import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type CourseOutputMode,
  type CourseStep,
  dialDegreesToStorageValue,
  formatCourseAngle,
  formatCourseDisplay,
  isCardinalDirection,
  loadCourseDialStep,
  parseCourseAngle,
  pointerAngleToDegrees,
  resolveCourseOutputMode,
  saveCourseDialStep,
  snapDegrees,
  valueToDialDegrees
} from '../utils/courseAngle.js'

interface CourseDialInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  step?: CourseStep
  allowCardinal?: boolean
  displayMode?: 'degrees' | 'cardinal' | 'auto'
  size?: 'md' | 'sm'
  'aria-label': string
  id?: string
}

const TICK_DEGREES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

function polarPoint(degrees: number, radius: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180
  return {
    x: 100 + Math.sin(rad) * radius,
    y: 100 - Math.cos(rad) * radius
  }
}

export default function CourseDialInput({
  value,
  onChange,
  disabled = false,
  step: stepProp,
  allowCardinal = false,
  displayMode = 'degrees',
  size = 'md',
  'aria-label': ariaLabel,
  id: idProp
}: CourseDialInputProps) {
  const { t } = useTranslation()
  const generatedId = useId()
  const inputId = idProp ?? `${generatedId}-input`
  const svgRef = useRef<SVGSVGElement>(null)
  const [step, setStep] = useState<CourseStep>(() => stepProp ?? loadCourseDialStep())
  const [inputDraft, setInputDraft] = useState<string | null>(null)
  const [outputModeOverride, setOutputModeOverride] = useState<CourseOutputMode | null>(null)

  const effectiveStep = stepProp ?? step
  const outputMode =
    outputModeOverride ??
    resolveCourseOutputMode(value, displayMode, allowCardinal)

  const dialDegrees = useMemo(
    () => snapDegrees(valueToDialDegrees(value, allowCardinal), effectiveStep),
    [value, allowCardinal, effectiveStep]
  )

  const centerLabel = useMemo(
    () => formatCourseDisplay(value, allowCardinal),
    [value, allowCardinal]
  )

  const applyDegrees = useCallback(
    (degrees: number) => {
      onChange(dialDegreesToStorageValue(degrees, outputMode, effectiveStep))
      setInputDraft(null)
    },
    [onChange, outputMode, effectiveStep]
  )

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg || disabled) return
      const rect = svg.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const raw = pointerAngleToDegrees(clientX, clientY, cx, cy)
      applyDegrees(raw)
    },
    [applyDegrees, disabled]
  )

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromPointer(e.clientX, e.clientY)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    updateFromPointer(e.clientX, e.clientY)
  }

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputDraft(e.target.value)
  }

  const commitInput = () => {
    const draft = (inputDraft ?? value).trim()
    setInputDraft(null)
    if (!draft) {
      onChange('')
      return
    }
    if (allowCardinal && outputMode === 'cardinal' && isCardinalDirection(draft)) {
      onChange(draft.toUpperCase())
      return
    }
    const parsed = parseCourseAngle(draft)
    if (parsed === null) return
    onChange(formatCourseAngle(snapDegrees(parsed, effectiveStep)))
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitInput()
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const base = parseCourseAngle(value) ?? dialDegrees
      const delta = e.key === 'ArrowUp' ? effectiveStep : -effectiveStep
      applyDegrees(base + delta)
    }
  }

  const handleStepChange = (next: CourseStep) => {
    if (stepProp !== undefined) return
    setStep(next)
    saveCourseDialStep(next)
    const parsed = parseCourseAngle(value)
    if (parsed !== null) {
      onChange(formatCourseAngle(snapDegrees(parsed, next)))
    }
  }

  const toggleOutputMode = () => {
    const next: CourseOutputMode = outputMode === 'cardinal' ? 'degrees' : 'cardinal'
    setOutputModeOverride(next)
    const deg = valueToDialDegrees(value, allowCardinal)
    onChange(dialDegreesToStorageValue(deg, next, effectiveStep))
  }

  const inputValue = inputDraft ?? value
  const sliderNow = dialDegrees

  return (
    <div
      className={`course-dial course-dial--${size}${disabled ? ' course-dial--disabled' : ''}`}
    >
      {!stepProp && (
        <div className="course-dial__step-toolbar" role="group" aria-label={ariaLabel}>
          {([1, 5, 10] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`course-dial__step-btn${effectiveStep === s ? ' is-active' : ''}`}
              onClick={() => handleStepChange(s)}
              disabled={disabled}
              aria-pressed={effectiveStep === s}
            >
              {s === 1 ? t('logs.course_step_fine') : s === 5 ? t('logs.course_step_medium') : t('logs.course_step_coarse')}
            </button>
          ))}
        </div>
      )}

      <div
        className="course-dial__ring-wrap"
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={sliderNow}
        aria-disabled={disabled}
      >
        <svg
          ref={svgRef}
          className="course-dial__svg"
          viewBox="0 0 200 200"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <circle className="course-dial__track" cx="100" cy="100" r="88" />
          {TICK_DEGREES.map((deg) => {
            const inner = polarPoint(deg, 76)
            const outer = polarPoint(deg, 88)
            const label = polarPoint(deg, 64)
            return (
              <g key={deg}>
                <line className="course-dial__tick" x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />
                <text className="course-dial__label" x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">
                  {String(deg).padStart(3, '0')}
                </text>
              </g>
            )
          })}
          <g className="course-dial__needle" transform={`rotate(${dialDegrees} 100 100)`}>
            <line x1="100" y1="100" x2="100" y2="28" />
            <circle cx="100" cy="100" r="6" />
          </g>
          <text className="course-dial__center" x="100" y="100" textAnchor="middle" dominantBaseline="middle">
            {centerLabel}
          </text>
        </svg>
      </div>

      <p className="course-dial__hint">{t('logs.course_dial_hint')}</p>

      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        className="input-text course-dial__input"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={commitInput}
        onKeyDown={handleInputKeyDown}
        disabled={disabled}
        placeholder={outputMode === 'cardinal' ? 'NW' : '180'}
        aria-label={ariaLabel}
      />

      {allowCardinal && displayMode === 'auto' && (
        <button
          type="button"
          className="course-dial__mode-toggle"
          onClick={toggleOutputMode}
          disabled={disabled}
        >
          {outputMode === 'cardinal' ? t('logs.wind_mode_degrees') : t('logs.wind_mode_cardinal')}
        </button>
      )}
    </div>
  )
}
