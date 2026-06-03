export const PlausibleEvents = {
  ACCOUNT_CREATED: 'Account Created',
  LOGGED_IN: 'Logged In',
  LOGBOOK_CREATED: 'Logbook Created',
  TRAVEL_DAY_CREATED: 'Travel Day Created',
  TRAVEL_DAY_SAVED: 'Travel Day Saved',
  ENTRY_SIGNED: 'Entry Signed',
  LOGBOOK_DELETED: 'Logbook Deleted',
  ACCOUNT_DELETED: 'Account Deleted',
  GPS_TRACK_UPLOADED: 'GPS Track Uploaded',
  VESSEL_SAVED: 'Vessel Saved',
  CREW_SAVED: 'Crew Saved',
  ONBOARDING_TOUR_COMPLETED: 'Onboarding Tour Completed',
  ONBOARDING_TOUR_SKIPPED: 'Onboarding Tour Skipped',
  INVITE_GENERATED: 'Invite Generated',
  INVITE_ACCEPTED: 'Invite Accepted',
  LOGBOOK_SHARED: 'Logbook Shared',
  PUBLIC_LINK_OPENED: 'Public Link Opened',
  PDF_EXPORTED: 'PDF Exported',
  CSV_EXPORTED: 'CSV Exported',
  CSV_SHARED: 'CSV Shared',
  PHOTO_UPLOADED: 'Photo Uploaded',
  BACKUP_EXPORTED: 'Backup Exported',
  BACKUP_RESTORED: 'Backup Restored',
  DEMO_OPENED: 'Demo Opened',
  PUSH_ENABLED: 'Push Enabled',
  PUSH_DISABLED: 'Push Disabled',
  FOOTER_LINK_CLICKED: 'Footer Link Clicked',
  PROFILE_OPENED: 'Profile Opened',
  PASSKEY_ADDED: 'Passkey Added',
  PASSKEY_REMOVED: 'Passkey Removed',
  PASSKEY_RENAMED: 'Passkey Renamed',
  LAST_PASSKEY_REMOVE_HINTED: 'Last Passkey Remove Hinted',
  LOCAL_PIN_SET: 'Local PIN Set',
  LOCAL_PIN_REMOVED: 'Local PIN Removed',
  DEVICE_FORGOTTEN: 'Device Forgotten',
  RECOVERY_ROTATED: 'Recovery Rotated',
  LANGUAGE_CHANGED: 'Language Changed',
  NMEA_IMPORTED: 'NMEA Imported',
  NMEA_UPLOADED: 'NMEA Uploaded',
  LIVE_LOG_OPENED: 'Live Log Opened',
  LIVE_LOG_EVENT_LOGGED: 'Live Log Event Logged',
  LIVE_LOG_PHOTO_UPLOADED: 'Live Log Photo Uploaded',
  VOICE_MEMO_UPLOADED: 'Voice Memo Uploaded',
  LIVE_LOG_VOICE_UPLOADED: 'Live Log Voice Uploaded',
  OWM_WEATHER_FETCHED: 'OWM Weather Fetched',
  AI_SUMMARY_GENERATED: 'AI Summary Generated',
  PWA_BOOT_WATCHDOG_SOFT: 'PWA Boot Watchdog Soft',
  PWA_BOOT_WATCHDOG_HARD: 'PWA Boot Watchdog Hard',
  PWA_BOOT_WATCHDOG_FALLBACK: 'PWA Boot Watchdog Fallback',
  PWA_BOOT_WATCHDOG_MANUAL_REPAIR: 'PWA Boot Watchdog Manual Repair'
} as const

/** Where a successful OpenWeatherMap API call originated (no coordinates or place names). */
export type OwmAnalyticsSource = 'live_log' | 'entry_editor' | 'entry_editor_gps_lookup'

export type PlausibleEventName = (typeof PlausibleEvents)[keyof typeof PlausibleEvents]

export type PlausibleEventProps = Record<string, string | number | boolean>
type PendingPwaBootEvent = {
  name: PlausibleEventName
  props?: PlausibleEventProps
  ts?: number
}

const PWA_BOOT_PENDING_EVENTS_KEY = 'pwa_boot_pending_events'

export function trackPlausibleEvent(name: PlausibleEventName, props?: PlausibleEventProps): void {
  if (typeof window.plausible !== 'function') return
  if (props && Object.keys(props).length > 0) {
    window.plausible(name, { props })
    return
  }
  window.plausible(name)
}

export function flushPendingPwaBootEvents(): number {
  if (typeof window.plausible !== 'function') return 0

  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(PWA_BOOT_PENDING_EVENTS_KEY)
  } catch {
    return 0
  }
  if (!raw) return 0

  let pending: PendingPwaBootEvent[]
  try {
    pending = JSON.parse(raw) as PendingPwaBootEvent[]
  } catch {
    try {
      sessionStorage.removeItem(PWA_BOOT_PENDING_EVENTS_KEY)
    } catch {
      /* ignore storage errors */
    }
    return 0
  }

  if (!Array.isArray(pending) || pending.length === 0) {
    try {
      sessionStorage.removeItem(PWA_BOOT_PENDING_EVENTS_KEY)
    } catch {
      /* ignore storage errors */
    }
    return 0
  }

  for (const event of pending) {
    if (!event || typeof event.name !== 'string') continue
    if (event.props && Object.keys(event.props).length > 0) {
      window.plausible(event.name, { props: event.props })
    } else {
      window.plausible(event.name)
    }
  }

  try {
    sessionStorage.removeItem(PWA_BOOT_PENDING_EVENTS_KEY)
  } catch {
    /* ignore storage errors */
  }
  return pending.length
}
