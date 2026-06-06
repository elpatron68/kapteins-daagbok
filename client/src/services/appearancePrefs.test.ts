import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAppearancePrefs,
  saveAppearancePrefsToServer,
  syncAppearancePrefs
} from './appearancePrefs.js'
import { setThemePreference } from './userPreferences.js'

const USER_ID = 'appearance-sync-user'

vi.mock('./api.js', () => ({
  apiJson: vi.fn()
}))

import { apiJson } from './api.js'

const mockedApiJson = vi.mocked(apiJson)

describe('appearancePrefs', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('fetchAppearancePrefs returns defaults when not authenticated', async () => {
    await expect(fetchAppearancePrefs()).resolves.toEqual({
      theme: 'auto',
      colorScheme: 'auto',
      aiAuthorized: false,
      persisted: false
    })
    expect(mockedApiJson).not.toHaveBeenCalled()
  })

  it('syncAppearancePrefs applies server prefs after cache wipe', async () => {
    localStorage.setItem('active_userid', USER_ID)
    mockedApiJson.mockResolvedValueOnce({
      theme: 'ocean',
      colorScheme: 'dark',
      aiAuthorized: true,
      persisted: true
    })

    const changed = vi.fn()
    window.addEventListener('appearance-changed', changed)

    await syncAppearancePrefs(USER_ID)

    expect(localStorage.getItem(`user_pref_theme_${USER_ID}`)).toBe('ocean')
    expect(localStorage.getItem(`user_pref_color_scheme_${USER_ID}`)).toBe('dark')
    expect(localStorage.getItem(`user_pref_ai_authorized_${USER_ID}`)).toBe('true')
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('syncAppearancePrefs uploads local prefs when server has none', async () => {
    localStorage.setItem('active_userid', USER_ID)
    setThemePreference(USER_ID, 'material')
    mockedApiJson
      .mockResolvedValueOnce({ theme: 'auto', colorScheme: 'auto', aiAuthorized: false, persisted: false })
      .mockResolvedValueOnce({ theme: 'material', colorScheme: 'auto', aiAuthorized: false, persisted: true })

    await syncAppearancePrefs(USER_ID)

    expect(mockedApiJson).toHaveBeenCalledTimes(2)
    expect(mockedApiJson).toHaveBeenLastCalledWith('/api/auth/appearance-prefs', {
      method: 'PUT',
      body: JSON.stringify({ theme: 'material', colorScheme: 'auto', aiAuthorized: false })
    })
  })

  it('saveAppearancePrefsToServer skips when not authenticated', async () => {
    await saveAppearancePrefsToServer('ocean', 'light', true)
    expect(mockedApiJson).not.toHaveBeenCalled()
  })

  it('syncAppearancePrefs skips server sync when userId does not match active session', async () => {
    localStorage.setItem('active_userid', 'session-user')
    setThemePreference('other-user', 'ocean')
    mockedApiJson.mockResolvedValue({
      theme: 'material',
      colorScheme: 'dark',
      aiAuthorized: false,
      persisted: true
    })

    await syncAppearancePrefs('other-user')

    expect(mockedApiJson).not.toHaveBeenCalled()
    expect(localStorage.getItem('user_pref_theme_other-user')).toBe('ocean')
  })

  it('syncAppearancePrefs skips server sync when active session is missing', async () => {
    setThemePreference(USER_ID, 'ocean')

    await syncAppearancePrefs(USER_ID)

    expect(mockedApiJson).not.toHaveBeenCalled()
    expect(localStorage.getItem(`user_pref_theme_${USER_ID}`)).toBe('ocean')
  })
})
