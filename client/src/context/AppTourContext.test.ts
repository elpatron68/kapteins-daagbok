import { describe, expect, it } from 'vitest'
import {
  DEMO_EXCLUDED_STEPS,
  DEMO_STEP_ORDER,
  FULL_STEP_ORDER,
  tourStepOpensEntry
} from './AppTourContext.tsx'

describe('AppTourContext step order', () => {
  it('includes profile steps before finish in full tour', () => {
    const profileIndex = FULL_STEP_ORDER.indexOf('nav_profile')
    const prefsIndex = FULL_STEP_ORDER.indexOf('profile_preferences')
    const finishIndex = FULL_STEP_ORDER.indexOf('finish')

    expect(profileIndex).toBeGreaterThan(FULL_STEP_ORDER.indexOf('nav_feedback'))
    expect(prefsIndex).toBe(profileIndex + 1)
    expect(finishIndex).toBe(prefsIndex + 1)
    expect(FULL_STEP_ORDER).toHaveLength(12)
  })

  it('excludes profile, stats and feedback from demo tour', () => {
    for (const step of DEMO_EXCLUDED_STEPS) {
      expect(DEMO_STEP_ORDER).not.toContain(step)
    }
    expect(DEMO_STEP_ORDER).toContain('finish')
    expect(DEMO_STEP_ORDER).toHaveLength(FULL_STEP_ORDER.length - DEMO_EXCLUDED_STEPS.length)
  })

  it('only opens entry editor on entry_track step', () => {
    expect(tourStepOpensEntry('entry_open')).toBe(false)
    expect(tourStepOpensEntry('entry_list')).toBe(false)
    expect(tourStepOpensEntry('entry_track')).toBe(true)
  })
})
