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
  markTourCompleted
} from '../services/appTourStorage.js'
import { getStoredDemoFirstEntryId } from '../services/demoLogbook.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

export type AppTab = 'vessel' | 'crew' | 'logs' | 'settings'

export type TourStepId =
  | 'welcome'
  | 'nav_logs'
  | 'entry_list'
  | 'entry_open'
  | 'entry_track'
  | 'nav_vessel'
  | 'nav_crew'
  | 'finish'

interface TourNavigation {
  setActiveTab: (tab: AppTab) => void
  setSelectedEntryId: (entryId: string | null) => void
}

interface AppTourContextValue {
  isActive: boolean
  currentStepId: TourStepId | null
  currentStepIndex: number
  totalSteps: number
  startTour: (options?: { force?: boolean }) => void
  stopTour: () => void
  restartTour: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  registerNavigation: (navigation: TourNavigation) => void
  requestStartAfterLogin: () => void
}

const STEP_ORDER: TourStepId[] = [
  'welcome',
  'nav_logs',
  'entry_list',
  'entry_open',
  'entry_track',
  'nav_vessel',
  'nav_crew',
  'finish'
]

const TARGET_BY_STEP: Partial<Record<TourStepId, string>> = {
  nav_logs: '[data-tour="nav-logs"]',
  entry_list: '[data-tour="entry-list"]',
  entry_open: '[data-tour="entry-first"]',
  entry_track: '[data-tour="entry-track"]',
  nav_vessel: '[data-tour="nav-vessel"]',
  nav_crew: '[data-tour="nav-crew"]'
}

const AppTourContext = createContext<AppTourContextValue | null>(null)

export function AppTourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [pendingAfterLogin, setPendingAfterLogin] = useState(false)
  const navigationRef = useRef<TourNavigation | null>(null)

  const currentStepId = isActive ? STEP_ORDER[stepIndex] ?? null : null

  const applyStepSideEffects = useCallback((stepId: TourStepId) => {
    const nav = navigationRef.current
    if (!nav) return

    if (stepId === 'nav_logs' || stepId === 'entry_list' || stepId === 'entry_open' || stepId === 'entry_track') {
      nav.setActiveTab('logs')
    }
    if (stepId === 'entry_open' || stepId === 'entry_track') {
      const firstEntryId = getStoredDemoFirstEntryId()
      if (firstEntryId) nav.setSelectedEntryId(firstEntryId)
    }
    if (stepId === 'nav_vessel') {
      nav.setSelectedEntryId(null)
      nav.setActiveTab('vessel')
    }
    if (stepId === 'nav_crew') {
      nav.setSelectedEntryId(null)
      nav.setActiveTab('crew')
    }
  }, [])

  const scrollToCurrentTarget = useCallback((stepId: TourStepId | null) => {
    if (!stepId) return
    const selector = TARGET_BY_STEP[stepId]
    if (!selector) return
    window.requestAnimationFrame(() => {
      const el = document.querySelector(selector)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })
  }, [])

  const startTour = useCallback((options?: { force?: boolean }) => {
    const userId = localStorage.getItem('active_userid')
    if (!userId) return
    if (!options?.force && isTourCompleted(userId)) return

    setStepIndex(0)
    setIsActive(true)
  }, [])

  const dismissTour = useCallback((outcome: 'completed' | 'skipped', stepIndexAtDismiss: number) => {
    const userId = localStorage.getItem('active_userid')
    if (userId) markTourCompleted(userId)
    if (outcome === 'completed') {
      trackPlausibleEvent(PlausibleEvents.ONBOARDING_TOUR_COMPLETED)
    } else {
      const step = STEP_ORDER[stepIndexAtDismiss] ?? 'welcome'
      trackPlausibleEvent(PlausibleEvents.ONBOARDING_TOUR_SKIPPED, { step })
    }
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
    if (stepIndex + 1 >= STEP_ORDER.length) {
      dismissTour('completed', stepIndex)
      return
    }
    setStepIndex(stepIndex + 1)
  }, [dismissTour, stepIndex])

  const prevStep = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1))
  }, [])

  useEffect(() => {
    if (!isActive) return
    const stepId = STEP_ORDER[stepIndex]
    if (!stepId) return
    applyStepSideEffects(stepId)
    scrollToCurrentTarget(stepId)
  }, [isActive, stepIndex, applyStepSideEffects, scrollToCurrentTarget])

  const restartTour = useCallback(() => {
    const userId = localStorage.getItem('active_userid')
    if (!userId) return
    clearTourCompleted(userId)
    startTour({ force: true })
  }, [startTour])

  const registerNavigation = useCallback((navigation: TourNavigation) => {
    navigationRef.current = navigation
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
      currentStepId,
      currentStepIndex: stepIndex,
      totalSteps: STEP_ORDER.length,
      startTour,
      stopTour,
      restartTour,
      nextStep,
      prevStep,
      skipTour,
      registerNavigation,
      requestStartAfterLogin
    }),
    [
      currentStepId,
      isActive,
      nextStep,
      prevStep,
      registerNavigation,
      requestStartAfterLogin,
      restartTour,
      skipTour,
      startTour,
      stepIndex,
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
  t: (key: string) => string
): { title: string; body: string } {
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
