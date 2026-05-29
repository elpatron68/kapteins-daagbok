import type { LogEventPayload } from './logEntryPayload.js'

export type PropulsionMode = 'sail' | 'motor'

const MOTOR_LABELS = ['Maschinenfahrt', 'Engine Propulsion']

export function isMotorPropulsion(sailsOrMotor: string): boolean {
  const normalized = sailsOrMotor.trim().toLowerCase()
  if (!normalized) return false
  return MOTOR_LABELS.some((label) => normalized.includes(label.toLowerCase()))
}

export function classifyEventPropulsion(event: Pick<LogEventPayload, 'sailsOrMotor'>): PropulsionMode {
  return isMotorPropulsion(event.sailsOrMotor) ? 'motor' : 'sail'
}

export interface PropulsionDistanceSplit {
  sailDistanceNm: number
  motorDistanceNm: number
  unknownPropulsionNm: number
}

export function splitDistanceByPropulsion(
  distanceNm: number,
  events: Pick<LogEventPayload, 'sailsOrMotor'>[]
): PropulsionDistanceSplit {
  if (distanceNm <= 0) {
    return { sailDistanceNm: 0, motorDistanceNm: 0, unknownPropulsionNm: 0 }
  }

  const classified = events.filter((e) => e.sailsOrMotor.trim())
  if (classified.length === 0) {
    return { sailDistanceNm: 0, motorDistanceNm: 0, unknownPropulsionNm: distanceNm }
  }

  let motorCount = 0
  let sailCount = 0
  for (const event of classified) {
    if (isMotorPropulsion(event.sailsOrMotor)) {
      motorCount++
    } else {
      sailCount++
    }
  }

  const total = motorCount + sailCount
  const motorDistanceNm = Number(((distanceNm * motorCount) / total).toFixed(2))
  const sailDistanceNm = Number((distanceNm - motorDistanceNm).toFixed(2))

  return { sailDistanceNm, motorDistanceNm, unknownPropulsionNm: 0 }
}

export function parseEventDistanceNm(distance: string): number {
  const match = distance.replace(',', '.').match(/(\d+(?:\.\d+)?)/)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : 0
}
