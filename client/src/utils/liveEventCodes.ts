/** Machine-readable live-log markers stored in event.remarks (locale-independent). */
export const LIVE_EVENT_CODES = {
  MOTOR_START: '__live:motor_start',
  MOTOR_STOP: '__live:motor_stop',
  CAST_OFF: '__live:cast_off',
  MOOR: '__live:moor',
  FIX: '__live:fix',
  AUTO_POSITION: '__live:auto_position',
  COURSE: '__live:course',
  WIND: '__live:wind',
  PRESSURE: '__live:pressure',
  SEA_STATE: '__live:sea_state'
} as const

export type LiveEventCode = (typeof LIVE_EVENT_CODES)[keyof typeof LIVE_EVENT_CODES]

export function liveSailsRemark(sails: string): string {
  return `__live:sails:${sails}`
}

export function liveCommentRemark(text: string): string {
  return `__live:comment:${text}`
}

export function liveTempRemark(tempC: string): string {
  return `__live:temp:${tempC}`
}

export function livePrecipRemark(text: string): string {
  return `__live:precip:${text}`
}

export function liveFuelRemark(liters: string): string {
  return `__live:fuel:${liters}`
}

export function liveWaterRemark(liters: string): string {
  return `__live:water:${liters}`
}

export function parseLiveSailsRemark(remarks: string): string | null {
  const prefix = '__live:sails:'
  return remarks.startsWith(prefix) ? remarks.slice(prefix.length) : null
}

export function parseLiveCommentRemark(remarks: string): string | null {
  const prefix = '__live:comment:'
  return remarks.startsWith(prefix) ? remarks.slice(prefix.length) : null
}

export function parseLiveTempRemark(remarks: string): string | null {
  const prefix = '__live:temp:'
  return remarks.startsWith(prefix) ? remarks.slice(prefix.length) : null
}

export function parseLivePrecipRemark(remarks: string): string | null {
  const prefix = '__live:precip:'
  return remarks.startsWith(prefix) ? remarks.slice(prefix.length) : null
}

export function parseLiveFuelRemark(remarks: string): string | null {
  const prefix = '__live:fuel:'
  return remarks.startsWith(prefix) ? remarks.slice(prefix.length) : null
}

export function parseLiveWaterRemark(remarks: string): string | null {
  const prefix = '__live:water:'
  return remarks.startsWith(prefix) ? remarks.slice(prefix.length) : null
}

/** Derive motor running state from event history (survives reload). */
export function isMotorRunningFromEvents(
  events: Array<{ remarks: string }>,
  motorStartCode: string = LIVE_EVENT_CODES.MOTOR_START,
  motorStopCode: string = LIVE_EVENT_CODES.MOTOR_STOP
): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const code = events[i].remarks.trim()
    if (code === motorStartCode) return true
    if (code === motorStopCode) return false
  }
  return false
}

export function eventTimestampMs(date: string, time: string): number | null {
  const normalized = time.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!normalized || !date) return null
  const hours = parseInt(normalized[1], 10)
  const minutes = parseInt(normalized[2], 10)
  if (hours > 23 || minutes > 59) return null
  const parsed = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

export function getLastAutoPositionMs(
  events: Array<{ remarks: string; time: string }>,
  entryDate: string
): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].remarks.trim() !== LIVE_EVENT_CODES.AUTO_POSITION) continue
    return eventTimestampMs(entryDate, events[i].time)
  }
  return null
}
