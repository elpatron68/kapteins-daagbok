export const CARDINAL_DIRECTIONS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
] as const

export type CardinalDirection = (typeof CARDINAL_DIRECTIONS)[number]
export type CourseStep = 1 | 5 | 10

const CARDINAL_SET = new Set<string>(CARDINAL_DIRECTIONS)

export function isCardinalDirection(value: string): boolean {
  return CARDINAL_SET.has(value.trim().toUpperCase())
}

export function cardinalToDegrees(label: string): number | null {
  const upper = label.trim().toUpperCase()
  const index = CARDINAL_DIRECTIONS.indexOf(upper as CardinalDirection)
  if (index < 0) return null
  return (index * 22.5) % 360
}

export function degreesToCardinal(degrees: number): CardinalDirection {
  const normalized = ((degrees % 360) + 360) % 360
  const index = Math.round(normalized / 22.5) % 16
  return CARDINAL_DIRECTIONS[index]
}

export function snapDegrees(degrees: number, step: CourseStep): number {
  const normalized = ((degrees % 360) + 360) % 360
  const snapped = Math.round(normalized / step) * step
  return snapped >= 360 ? 0 : snapped
}

/** 0° = north, clockwise (maritime compass). */
export function pointerAngleToDegrees(
  clientX: number,
  clientY: number,
  centerX: number,
  centerY: number
): number {
  const dx = clientX - centerX
  const dy = centerY - clientY
  const radians = Math.atan2(dx, dy)
  let degrees = (radians * 180) / Math.PI
  if (degrees < 0) degrees += 360
  return degrees
}

export function parseCourseAngle(value: string): number | null {
  const trimmed = value.trim().replace(/°/g, '')
  if (!trimmed) return null

  const cardinalDeg = cardinalToDegrees(trimmed)
  if (cardinalDeg !== null) return Math.round(cardinalDeg)

  if (!/^\d{1,3}$/.test(trimmed)) return null
  const degrees = parseInt(trimmed, 10)
  if (Number.isNaN(degrees)) return null
  if (degrees === 360) return 0
  if (degrees < 0 || degrees > 360) return null
  return degrees
}

export function formatCourseAngle(degrees: number, pad = false): string {
  const normalized = ((Math.round(degrees) % 360) + 360) % 360
  const text = String(normalized)
  return pad ? text.padStart(3, '0') : text
}

export function normalizeCourseAngleString(
  value: string,
  options?: { allowEmpty?: boolean }
): string {
  const trimmed = value.trim()
  if (!trimmed) return options?.allowEmpty ? '' : ''

  if (isCardinalDirection(trimmed)) {
    return trimmed.toUpperCase()
  }

  const parsed = parseCourseAngle(trimmed)
  if (parsed === null) return trimmed
  return formatCourseAngle(parsed)
}

export function normalizeWindDirectionString(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (isCardinalDirection(trimmed)) {
    return trimmed.toUpperCase()
  }

  const parsed = parseCourseAngle(trimmed)
  if (parsed === null) return trimmed
  return formatCourseAngle(parsed)
}

export function valueToDialDegrees(value: string, allowCardinal = false): number {
  const parsed = parseCourseAngle(value)
  if (parsed !== null) return parsed
  if (allowCardinal && isCardinalDirection(value)) {
    return cardinalToDegrees(value) ?? 0
  }
  return 0
}

export type CourseOutputMode = 'degrees' | 'cardinal'

export function resolveCourseOutputMode(
  value: string,
  displayMode: 'degrees' | 'cardinal' | 'auto',
  allowCardinal: boolean
): CourseOutputMode {
  if (!allowCardinal || displayMode === 'degrees') return 'degrees'
  if (displayMode === 'cardinal') return 'cardinal'
  return isCardinalDirection(value) ? 'cardinal' : 'degrees'
}

export function dialDegreesToStorageValue(
  degrees: number,
  mode: CourseOutputMode,
  step: CourseStep
): string {
  const snapped = snapDegrees(degrees, step)
  if (mode === 'cardinal') return degreesToCardinal(snapped)
  return formatCourseAngle(snapped)
}

export function formatCourseDisplay(
  value: string,
  allowCardinal: boolean
): string {
  if (!value.trim()) return '—'
  if (allowCardinal && isCardinalDirection(value)) return value.toUpperCase()
  const parsed = parseCourseAngle(value)
  if (parsed === null) return value
  return `${formatCourseAngle(parsed, true)}°`
}

const STEP_STORAGE_KEY = 'kaptein-course-dial-step'

export function loadCourseDialStep(): CourseStep {
  try {
    const raw = sessionStorage.getItem(STEP_STORAGE_KEY)
    if (raw === '5') return 5
    if (raw === '10') return 10
  } catch {
    /* ignore */
  }
  return 1
}

export function saveCourseDialStep(step: CourseStep): void {
  try {
    sessionStorage.setItem(STEP_STORAGE_KEY, String(step))
  } catch {
    /* ignore */
  }
}
