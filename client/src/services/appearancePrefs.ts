import { apiJson } from './api.js'
import { notifyAppearanceChanged } from './appearance.js'
import {
  getActiveUserId,
  getColorSchemePreference,
  getThemePreference,
  setColorSchemePreference,
  setThemePreference
} from './userPreferences.js'

const API_BASE = '/api/auth/appearance-prefs'

export interface AppearancePrefs {
  theme: string
  colorScheme: string
  persisted: boolean
}

function hasLocalAppearancePrefs(userId: string): boolean {
  return (
    localStorage.getItem(`user_pref_theme_${userId}`) != null ||
    localStorage.getItem(`user_pref_color_scheme_${userId}`) != null
  )
}

export async function fetchAppearancePrefs(): Promise<AppearancePrefs> {
  if (!getActiveUserId()) {
    return { theme: 'auto', colorScheme: 'auto', persisted: false }
  }

  return apiJson<AppearancePrefs>(API_BASE)
}

export async function saveAppearancePrefsToServer(theme: string, colorScheme: string): Promise<void> {
  if (!getActiveUserId()) return

  await apiJson<AppearancePrefs>(API_BASE, {
    method: 'PUT',
    body: JSON.stringify({ theme, colorScheme })
  })
}

/** Merge server-stored appearance with local cache (server wins after cache wipe). */
export async function syncAppearancePrefs(userId?: string | null): Promise<void> {
  const id = userId?.trim() || getActiveUserId()
  if (!id) return

  try {
    const server = await fetchAppearancePrefs()

    if (server.persisted) {
      setThemePreference(id, server.theme)
      setColorSchemePreference(id, server.colorScheme)
    } else if (hasLocalAppearancePrefs(id)) {
      await saveAppearancePrefsToServer(getThemePreference(id), getColorSchemePreference(id))
    }
  } catch (err) {
    console.warn('Failed to sync appearance preferences:', err)
  }

  notifyAppearanceChanged()
}
