export const PUBLIC_DEMO_TOUR_USER_ID = '__public_demo__'

export function getTourCompletedKey(userId: string): string {
  return `app_tour_completed_${userId}`
}

export function isTourCompleted(userId: string | null): boolean {
  if (!userId) return true
  return localStorage.getItem(getTourCompletedKey(userId)) === '1'
}

export function markTourCompleted(userId: string): void {
  localStorage.setItem(getTourCompletedKey(userId), '1')
}

export function clearTourCompleted(userId: string): void {
  localStorage.removeItem(getTourCompletedKey(userId))
}

export function resolveTourUserId(options?: { demoMode?: boolean }): string | null {
  const activeUserId = localStorage.getItem('active_userid')
  if (activeUserId) return activeUserId
  if (options?.demoMode) return PUBLIC_DEMO_TOUR_USER_ID
  return null
}
