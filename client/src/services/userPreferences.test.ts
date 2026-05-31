import { beforeEach, describe, expect, it } from 'vitest'
import {
  getColorSchemePreference,
  getOwmApiKey,
  getThemePreference,
  setColorSchemePreference,
  setOwmApiKey,
  setThemePreference
} from './userPreferences.js'

const USER_ID = 'test-user-123'

describe('userPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy theme and color scheme keys on first read', () => {
    localStorage.setItem('active_userid', USER_ID)
    localStorage.setItem('active_theme', 'material')
    localStorage.setItem('active_color_scheme', 'dark')

    expect(getThemePreference()).toBe('material')
    expect(getColorSchemePreference()).toBe('dark')
    expect(localStorage.getItem(`user_pref_theme_${USER_ID}`)).toBe('material')
    expect(localStorage.getItem(`user_pref_color_scheme_${USER_ID}`)).toBe('dark')
  })

  it('stores OWM key per user', () => {
    setOwmApiKey(USER_ID, 'secret-key')
    expect(getOwmApiKey(USER_ID)).toBe('secret-key')
    setOwmApiKey(USER_ID, '  ')
    expect(getOwmApiKey(USER_ID)).toBe('')
  })

  it('writes theme preferences to namespaced keys', () => {
    setThemePreference(USER_ID, 'ocean')
    setColorSchemePreference(USER_ID, 'light')
    expect(getThemePreference(USER_ID)).toBe('ocean')
    expect(getColorSchemePreference(USER_ID)).toBe('light')
  })
})
