import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyAppearanceToDocument,
  resolveAppTheme,
  resolveColorScheme,
  type AppTheme,
  type ResolvedColorScheme
} from './appearance.js'
import { setColorSchemePreference } from './userPreferences.js'

const USER_ID = 'appearance-test-user'

const COMBOS: Array<{ theme: AppTheme; scheme: ResolvedColorScheme }> = [
  { theme: 'ocean', scheme: 'dark' },
  { theme: 'ocean', scheme: 'light' },
  { theme: 'material', scheme: 'dark' },
  { theme: 'material', scheme: 'light' },
  { theme: 'cupertino', scheme: 'dark' },
  { theme: 'cupertino', scheme: 'light' }
]

describe('appearance', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    document.head.querySelector('meta[name="theme-color"]')?.remove()
  })

  it.each(COMBOS)('applies $theme · $scheme classes to document', ({ theme, scheme }) => {
    applyAppearanceToDocument(theme, scheme)

    const root = document.documentElement
    expect(root.classList.contains(`theme-${theme}`)).toBe(true)
    expect(root.classList.contains(`scheme-${scheme}`)).toBe(true)
    expect(root.style.colorScheme).toBe(scheme)
  })

  it('replaces previous theme classes when switching appearance', () => {
    applyAppearanceToDocument('ocean', 'dark')
    applyAppearanceToDocument('material', 'light')

    const root = document.documentElement
    expect(root.classList.contains('theme-material')).toBe(true)
    expect(root.classList.contains('theme-ocean')).toBe(false)
    expect(root.classList.contains('scheme-light')).toBe(true)
    expect(root.classList.contains('scheme-dark')).toBe(false)
  })

  it('resolves stored light scheme even when system prefers dark', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    )
    localStorage.setItem('active_userid', USER_ID)
    setColorSchemePreference(USER_ID, 'light')

    expect(resolveColorScheme()).toBe('light')
    applyAppearanceToDocument('material', resolveColorScheme())
    expect(document.documentElement.classList.contains('scheme-light')).toBe(true)
  })

  it('auto theme picks material on Android user agent', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
    })
    expect(resolveAppTheme()).toBe('material')
  })
})
