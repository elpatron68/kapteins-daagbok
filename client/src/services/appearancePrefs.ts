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

function resolveSyncedUserId(userId?: string | null): string | null {
  const id = userId?.trim() || getActiveUserId()?.trim() || null
  if (!id) return null

  const activeId = getActiveUserId()?.trim() || null
  if (!activeId || activeId !== id) return null

  return id
}

export async function fetchAppearancePrefs(userId?: string | null): Promise<AppearancePrefs> {
  if (!resolveSyncedUserId(userId)) {
    return { theme: 'auto', colorScheme: 'auto', persisted: false }
  }

  return apiJson<AppearancePrefs>(API_BASE)
}

export async function saveAppearancePrefsToServer(
  theme: string,
  colorScheme: string,
  userId?: string | null
): Promise<void> {
  if (!resolveSyncedUserId(userId)) return

  await apiJson<AppearancePrefs>(API_BASE, {
    method: 'PUT',
    body: JSON.stringify({ theme, colorScheme })
  })
}

/** Merge server-stored appearance with local cache (server wins after cache wipe). */
export async function syncAppearancePrefs(userId?: string | null): Promise<void> {
  const id = resolveSyncedUserId(userId)
  if (!id) return

  try {
    const server = await fetchAppearancePrefs(id)

    if (server.persisted) {
      setThemePreference(id, server.theme)
      setColorSchemePreference(id, server.colorScheme)
    } else if (hasLocalAppearancePrefs(id)) {
      await saveAppearancePrefsToServer(getThemePreference(id), getColorSchemePreference(id), id)
    }
  } catch (err) {
    console.warn('Failed to sync appearance preferences:', err)
  }

  notifyAppearanceChanged()
}
