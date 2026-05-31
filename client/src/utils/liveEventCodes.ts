/** Machine-readable live-log markers stored in event.remarks (locale-independent). */
export const LIVE_EVENT_CODES = {
  MOTOR_START: '__live:motor_start',
  MOTOR_STOP: '__live:motor_stop',
  CAST_OFF: '__live:cast_off',
  MOOR: '__live:moor',
  FIX: '__live:fix'
} as const

export type LiveEventCode = (typeof LIVE_EVENT_CODES)[keyof typeof LIVE_EVENT_CODES]

export function liveSailsRemark(sails: string): string {
  return `__live:sails:${sails}`
}

export function liveCommentRemark(text: string): string {
  return `__live:comment:${text}`
}

export function parseLiveSailsRemark(remarks: string): string | null {
  const prefix = '__live:sails:'
  return remarks.startsWith(prefix) ? remarks.slice(prefix.length) : null
}

export function parseLiveCommentRemark(remarks: string): string | null {
  const prefix = '__live:comment:'
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
