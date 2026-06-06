import { apiJson } from './api.js'
import { notifyAppearanceChanged } from './appearance.js'
import {
  getActiveUserId,
  getColorSchemePreference,
  getThemePreference,
  setColorSchemePreference,
  setThemePreference,
  getAiAuthorized,
  setAiAuthorized
} from './userPreferences.js'

const API_BASE = '/api/auth/appearance-prefs'

export interface AppearancePrefs {
  theme: string
  colorScheme: string
  aiAuthorized: boolean
  persisted: boolean
}

function hasLocalAppearancePrefs(userId: string): boolean {
  return (
    localStorage.getItem(`user_pref_theme_${userId}`) != null ||
    localStorage.getItem(`user_pref_color_scheme_${userId}`) != null ||
    localStorage.getItem(`user_pref_ai_authorized_${userId}`) != null
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
    return { theme: 'auto', colorScheme: 'auto', aiAuthorized: false, persisted: false }
  }

  return apiJson<AppearancePrefs>(API_BASE)
}

export async function saveAppearancePrefsToServer(
  theme: string,
  colorScheme: string,
  aiAuthorized: boolean,
  userId?: string | null
): Promise<void> {
  if (!resolveSyncedUserId(userId)) return

  await apiJson<AppearancePrefs>(API_BASE, {
    method: 'PUT',
    body: JSON.stringify({ theme, colorScheme, aiAuthorized })
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
      setAiAuthorized(id, server.aiAuthorized)
    } else if (hasLocalAppearancePrefs(id)) {
      await saveAppearancePrefsToServer(
        getThemePreference(id),
        getColorSchemePreference(id),
        getAiAuthorized(id),
        id
      )
    }
  } catch (err) {
    console.warn('Failed to sync appearance preferences:', err)
  }

  notifyAppearanceChanged()
}
