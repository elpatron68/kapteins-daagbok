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
  PDF_EXPORTED: 'PDF Exported',
  CSV_EXPORTED: 'CSV Exported',
  CSV_SHARED: 'CSV Shared',
  PHOTO_UPLOADED: 'Photo Uploaded',
  BACKUP_EXPORTED: 'Backup Exported',
  BACKUP_RESTORED: 'Backup Restored',
  DEMO_OPENED: 'Demo Opened'
} as const

export type PlausibleEventName = (typeof PlausibleEvents)[keyof typeof PlausibleEvents]

export type PlausibleEventProps = Record<string, string | number | boolean>

export function trackPlausibleEvent(name: PlausibleEventName, props?: PlausibleEventProps): void {
  if (typeof window.plausible !== 'function') return
  if (props && Object.keys(props).length > 0) {
    window.plausible(name, { props })
    return
  }
  window.plausible(name)
}
