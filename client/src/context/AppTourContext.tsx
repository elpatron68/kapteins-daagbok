import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  clearTourCompleted,
  isTourCompleted,
  markTourCompleted,
  resolveTourUserId
} from '../services/appTourStorage.js'
import { getStoredDemoFirstEntryId } from '../services/demoLogbook.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

export type AppTab = 'vessel' | 'crew' | 'logs' | 'stats' | 'settings'

export type TourStepId =
  | 'welcome'
  | 'nav_logs'
  | 'entry_list'
  | 'entry_open'
  | 'entry_track'
  | 'nav_vessel'
  | 'profile_crew_pool'
  | 'nav_logbook_crew'
  | 'nav_stats'
  | 'nav_feedback'
  | 'nav_profile'
  | 'profile_preferences'
  | 'finish'

interface TourNavigation {
  setActiveTab: (tab: AppTab) => void
  setSelectedEntryId: (entryId: string | null) => void
  setFeedbackOpen: (open: boolean) => void
  setLogbookActive: (active: boolean) => void
  setProfileOpen: (open: boolean) => void
  ensureLogbookForTour?: () => Promise<void>
}

interface DemoTourContext {
  firstEntryId: string
}

interface AppTourContextValue {
  isActive: boolean
  isDemoTour: boolean
  currentStepId: TourStepId | null
  currentStepIndex: number
  totalSteps: number
  layoutTick: number
  startTour: (options?: { force?: boolean; demoMode?: boolean }) => void
  stopTour: () => void
  restartTour: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  registerNavigation: (navigation: TourNavigation) => void
  registerDemoTourContext: (context: DemoTourContext | null) => void
  requestStartAfterLogin: () => void
}

export const FULL_STEP_ORDER: TourStepId[] = [
  'welcome',
  'nav_logs',
  'entry_list',
  'entry_open',
  'entry_track',
  'nav_vessel',
  'profile_crew_pool',
  'nav_logbook_crew',
  'nav_stats',
  'nav_feedback',
  'nav_profile',
  'profile_preferences',
  'finish'
]

/** Public demo has no stats/feedback/profile UI — skip those steps. */
export const DEMO_EXCLUDED_STEPS: TourStepId[] = [
  'profile_crew_pool',
  'nav_stats',
  'nav_feedback',
  'nav_profile',
  'profile_preferences'
]

export const DEMO_STEP_ORDER: TourStepId[] = FULL_STEP_ORDER.filter(
  (id) => !DEMO_EXCLUDED_STEPS.includes(id)
)

const LOGBOOK_TOUR_STEPS = new Set<TourStepId>([
  'nav_logs',
  'entry_list',
  'entry_open',
  'entry_track',
  'nav_vessel',
  'nav_logbook_crew',
  'nav_stats',
  'nav_feedback'
])

function getStepOrder(demoMode: boolean): TourStepId[] {
  return demoMode ? DEMO_STEP_ORDER : FULL_STEP_ORDER
}

const TARGET_BY_STEP: Partial<Record<TourStepId, string>> = {
  nav_logs: '[data-tour="nav-logs"]',
  entry_list: '[data-tour="entry-list"]',
  entry_open: '[data-tour="entry-first"]',
  entry_track: '[data-tour="entry-track"]',
  nav_vessel: '[data-tour="nav-vessel"]',
  profile_crew_pool: '[data-tour="profile-crew-pool"]',
  nav_logbook_crew: '[data-tour="nav-logbook-crew"]',
  nav_stats: '[data-tour="stats-dashboard"]',
  nav_feedback: '[data-tour="feedback-form"]',
  nav_profile: '[data-tour="nav-profile"]',
  profile_preferences: '[data-tour="profile-preferences"]'
}

/** Whether a tour step opens the first log entry editor (not the list card). */
export function tourStepOpensEntry(stepId: TourStepId): boolean {
  return stepId === 'entry_track'
}

export function getTourTargetDelay(stepId: TourStepId): number {
  if (stepId === 'entry_track') return 400
  if (stepId === 'nav_feedback') return 180
  if (stepId === 'nav_profile' || stepId === 'profile_preferences' || stepId === 'profile_crew_pool') {
    return 250
  }
  return 0
}

/** Extra scroll attempts while async UI (e.g. entry editor) mounts. */
export function getTourScrollRetryDelays(stepId: TourStepId): number[] {
  if (stepId === 'entry_track') return [400, 700, 1100, 1600]
  const initial = getTourTargetDelay(stepId)
  return initial > 0 ? [initial] : [0]
}

const AppTourContext = createContext<AppTourContextValue | null>(null)

export function AppTourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [pendingAfterLogin, setPendingAfterLogin] = useState(false)
  const [isDemoTour, setIsDemoTour] = useState(false)
  const [layoutTick, setLayoutTick] = useState(0)
  const navigationRef = useRef<TourNavigation | null>(null)
  const demoContextRef = useRef<DemoTourContext | null>(null)
  const tourModeRef = useRef<{ demoMode: boolean }>({ demoMode: false })

  const stepOrder = getStepOrder(isDemoTour)
  const currentStepId = isActive ? stepOrder[stepIndex] ?? null : null

  const resolveFirstEntryId = useCallback((): string | null => {
    return demoContextRef.current?.firstEntryId ?? getStoredDemoFirstEntryId()
  }, [])

  const applyStepSideEffects = useCallback((stepId: TourStepId) => {
    const nav = navigationRef.current
    if (!nav) return

    if (LOGBOOK_TOUR_STEPS.has(stepId)) {
      nav.setProfileOpen(false)
      nav.setLogbookActive(true)
    }

    if (stepId === 'nav_logs' || stepId === 'entry_list' || stepId === 'entry_open' || stepId === 'entry_track') {
      nav.setActiveTab('logs')
    }

    if (stepId === 'entry_list' || stepId === 'entry_open') {
      nav.setSelectedEntryId(null)
    } else if (tourStepOpensEntry(stepId)) {
      const firstEntryId = resolveFirstEntryId()
      if (firstEntryId) nav.setSelectedEntryId(firstEntryId)
    } else if (LOGBOOK_TOUR_STEPS.has(stepId)) {
      nav.setSelectedEntryId(null)
    }

    if (stepId === 'nav_vessel') {
      nav.setSelectedEntryId(null)
      nav.setActiveTab('vessel')
    }
    if (stepId === 'profile_crew_pool') {
      nav.setSelectedEntryId(null)
      nav.setLogbookActive(false)
      nav.setProfileOpen(true)
    }
    if (stepId === 'nav_logbook_crew') {
      nav.setSelectedEntryId(null)
      nav.setProfileOpen(false)
      nav.setLogbookActive(true)
      nav.setActiveTab('crew')
    }
    if (stepId === 'nav_stats') {
      nav.setSelectedEntryId(null)
      nav.setActiveTab('stats')
    }
    if (stepId === 'nav_feedback') {
      nav.setSelectedEntryId(null)
      nav.setFeedbackOpen(true)
    } else {
      nav.setFeedbackOpen(false)
    }

    if (stepId === 'nav_profile') {
      nav.setProfileOpen(false)
      nav.setLogbookActive(false)
    }
    if (stepId === 'profile_preferences') {
      nav.setLogbookActive(false)
      nav.setProfileOpen(true)
    }
  }, [resolveFirstEntryId])

  const scrollToCurrentTarget = useCallback((stepId: TourStepId | null) => {
    if (!stepId) return
    const selector = TARGET_BY_STEP[stepId]
    if (!selector) return

    for (const delayMs of getTourScrollRetryDelays(stepId)) {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          const el = document.querySelector(selector)
          el?.scrollIntoView({
            behavior: stepId === 'entry_track' ? 'instant' : 'smooth',
            block: 'center',
            inline: 'nearest'
          })
        })
      }, delayMs)
    }
  }, [])

  const startTour = useCallback((options?: { force?: boolean; demoMode?: boolean }) => {
    const demoMode = options?.demoMode === true
    const userId = resolveTourUserId({ demoMode })
    if (!userId) return
    if (!options?.force && isTourCompleted(userId)) return

    tourModeRef.current = { demoMode }
    setIsDemoTour(demoMode)
    setStepIndex(0)
    setIsActive(true)
  }, [])

  const dismissTour = useCallback((outcome: 'completed' | 'skipped', stepIndexAtDismiss: number) => {
    const userId = resolveTourUserId({ demoMode: tourModeRef.current.demoMode })
    if (userId) markTourCompleted(userId)

    const tourProps = tourModeRef.current.demoMode ? { mode: 'demo' } : undefined
    if (outcome === 'completed') {
      trackPlausibleEvent(PlausibleEvents.ONBOARDING_TOUR_COMPLETED, tourProps)
      const nav = navigationRef.current
      if (nav && !tourModeRef.current.demoMode) {
        nav.setProfileOpen(false)
        nav.setLogbookActive(true)
        nav.setSelectedEntryId(null)
        nav.setActiveTab('stats')
      }
    } else {
      const step = getStepOrder(tourModeRef.current.demoMode)[stepIndexAtDismiss] ?? 'welcome'
      trackPlausibleEvent(PlausibleEvents.ONBOARDING_TOUR_SKIPPED, { step, ...tourProps })
    }

    tourModeRef.current = { demoMode: false }
    navigationRef.current?.setFeedbackOpen(false)
    navigationRef.current?.setProfileOpen(false)
    setIsDemoTour(false)
    setIsActive(false)
    setStepIndex(0)
  }, [])

  const stopTour = useCallback(() => {
    dismissTour('skipped', stepIndex)
  }, [dismissTour, stepIndex])

  const skipTour = useCallback(() => {
    dismissTour('skipped', stepIndex)
  }, [dismissTour, stepIndex])

  const nextStep = useCallback(() => {
    const order = getStepOrder(isDemoTour)
    if (stepIndex + 1 >= order.length) {
      dismissTour('completed', stepIndex)
      return
    }
    setStepIndex(stepIndex + 1)
  }, [dismissTour, isDemoTour, stepIndex])

  const prevStep = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1))
  }, [])

  useEffect(() => {
    if (!isActive) return
    const stepId = getStepOrder(isDemoTour)[stepIndex]
    if (!stepId) return

    let cancelled = false
    const run = async () => {
      if (LOGBOOK_TOUR_STEPS.has(stepId) && !isDemoTour) {
        await navigationRef.current?.ensureLogbookForTour?.()
      }
      if (cancelled) return
      applyStepSideEffects(stepId)
      scrollToCurrentTarget(stepId)
      setLayoutTick((tick) => tick + 1)
      window.setTimeout(() => {
        if (!cancelled) setLayoutTick((tick) => tick + 1)
      }, 150)
    }
    void run()

    return () => {
      cancelled = true
    }
  }, [isActive, isDemoTour, stepIndex, applyStepSideEffects, scrollToCurrentTarget])

  const restartTour = useCallback(() => {
    const userId = localStorage.getItem('active_userid')
    if (!userId) return
    clearTourCompleted(userId)
    startTour({ force: true })
  }, [startTour])

  const registerNavigation = useCallback((navigation: TourNavigation) => {
    navigationRef.current = navigation
  }, [])

  const registerDemoTourContext = useCallback((context: DemoTourContext | null) => {
    demoContextRef.current = context
  }, [])

  const requestStartAfterLogin = useCallback(() => {
    setPendingAfterLogin(true)
  }, [])

  useEffect(() => {
    if (!pendingAfterLogin) return
    const userId = localStorage.getItem('active_userid')
    if (!userId || isTourCompleted(userId)) {
      setPendingAfterLogin(false)
      return
    }
    const timer = window.setTimeout(() => {
      startTour({ force: true })
      setPendingAfterLogin(false)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [pendingAfterLogin, startTour])

  const value = useMemo<AppTourContextValue>(
    () => ({
      isActive,
      isDemoTour,
      currentStepId,
      currentStepIndex: stepIndex,
      totalSteps: stepOrder.length,
      layoutTick,
      startTour,
      stopTour,
      restartTour,
      nextStep,
      prevStep,
      skipTour,
      registerNavigation,
      registerDemoTourContext,
      requestStartAfterLogin
    }),
    [
      currentStepId,
      isActive,
      isDemoTour,
      nextStep,
      prevStep,
      registerDemoTourContext,
      registerNavigation,
      requestStartAfterLogin,
      restartTour,
      skipTour,
      startTour,
      stepIndex,
      stepOrder.length,
      layoutTick,
      stopTour
    ]
  )

  return <AppTourContext.Provider value={value}>{children}</AppTourContext.Provider>
}

export function useAppTour(): AppTourContextValue {
  const ctx = useContext(AppTourContext)
  if (!ctx) {
    throw new Error('useAppTour must be used within AppTourProvider')
  }
  return ctx
}

export function getTourStepCopy(
  stepId: TourStepId,
  t: (key: string) => string,
  options?: { demoMode?: boolean }
): { title: string; body: string } {
  if (stepId === 'welcome' && options?.demoMode) {
    return {
      title: t('tour.steps.welcome_public.title'),
      body: t('tour.steps.welcome_public.body')
    }
  }
  return {
    title: t(`tour.steps.${stepId}.title`),
    body: t(`tour.steps.${stepId}.body`)
  }
}

export function getTourTargetSelector(stepId: TourStepId | null): string | null {
  if (!stepId) return null
  return TARGET_BY_STEP[stepId] ?? null
}

export function isCenteredTourStep(stepId: TourStepId | null): boolean {
  return stepId === 'welcome' || stepId === 'finish'
}

export function getTourTargetRetryDelay(stepId: TourStepId | null): number {
  if (stepId === 'entry_track') return 400
  if (stepId === 'profile_preferences') return 300
  if (stepId === 'nav_profile') return 200
  return 120
}
