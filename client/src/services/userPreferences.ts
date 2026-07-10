const LEGACY_THEME = 'active_theme'
const LEGACY_COLOR_SCHEME = 'active_color_scheme'
const LEGACY_OWM_KEY = 'owm_api_key'

function themeKey(userId: string): string {
  return `user_pref_theme_${userId}`
}

function colorSchemeKey(userId: string): string {
  return `user_pref_color_scheme_${userId}`
}

function owmKey(userId: string): string {
  return `user_pref_owm_api_key_${userId}`
}

export function getActiveUserId(): string | null {
  return localStorage.getItem('active_userid')
}

function migrateLegacyPrefs(userId: string): void {
  const pairs: Array<{ namespaced: string; legacy: string }> = [
    { namespaced: themeKey(userId), legacy: LEGACY_THEME },
    { namespaced: colorSchemeKey(userId), legacy: LEGACY_COLOR_SCHEME },
    { namespaced: owmKey(userId), legacy: LEGACY_OWM_KEY }
  ]

  for (const { namespaced, legacy } of pairs) {
    if (localStorage.getItem(namespaced) != null) continue
    const value = localStorage.getItem(legacy)
    if (value != null) {
      localStorage.setItem(namespaced, value)
    }
  }
}

function resolveUserId(userId?: string | null): string | null {
  const id = (userId?.trim() || getActiveUserId()?.trim()) || null
  if (!id) return null
  migrateLegacyPrefs(id)
  return id
}

export function getThemePreference(userId?: string | null): string {
  const id = resolveUserId(userId)
  if (id) {
    return localStorage.getItem(themeKey(id)) ?? localStorage.getItem(LEGACY_THEME) ?? 'auto'
  }
  return localStorage.getItem(LEGACY_THEME) ?? 'auto'
}

export function setThemePreference(userId: string, value: string): void {
  migrateLegacyPrefs(userId)
  localStorage.setItem(themeKey(userId), value)
}

export function getColorSchemePreference(userId?: string | null): string {
  const id = resolveUserId(userId)
  if (id) {
    return localStorage.getItem(colorSchemeKey(id)) ?? localStorage.getItem(LEGACY_COLOR_SCHEME) ?? 'auto'
  }
  return localStorage.getItem(LEGACY_COLOR_SCHEME) ?? 'auto'
}

export function setColorSchemePreference(userId: string, value: string): void {
  migrateLegacyPrefs(userId)
  localStorage.setItem(colorSchemeKey(userId), value)
}

export function getOwmApiKey(userId?: string | null): string {
  const id = resolveUserId(userId)
  if (id) {
    return localStorage.getItem(owmKey(id)) ?? localStorage.getItem(LEGACY_OWM_KEY) ?? ''
  }
  return localStorage.getItem(LEGACY_OWM_KEY) ?? ''
}

/** OWM key for the signed-in user (`active_userid`). Prefer this over a bare `getOwmApiKey()` call. */
export function getOwmApiKeyForActiveUser(): string {
  return getOwmApiKey(getActiveUserId())
}

export function setOwmApiKey(userId: string, value: string): void {
  migrateLegacyPrefs(userId)
  const trimmed = value.trim()
  if (trimmed) {
    localStorage.setItem(owmKey(userId), trimmed)
  } else {
    localStorage.removeItem(owmKey(userId))
  }
}

function logsViewModeKey(userId: string): string {
  return `user_pref_logs_view_mode_${userId}`
}

export type LogsViewModePreference = 'list' | 'live'

export function getLogsViewModePreference(userId?: string | null): LogsViewModePreference {
  const id = resolveUserId(userId)
  if (id) {
    const value = localStorage.getItem(logsViewModeKey(id))
    if (value === 'list' || value === 'live') return value
  }
  return 'live'
}

export function setLogsViewModePreference(userId: string, value: LogsViewModePreference): void {
  localStorage.setItem(logsViewModeKey(userId), value)
}

function aiAuthorizedKey(userId: string): string {
  return `user_pref_ai_authorized_${userId}`
}

export function getAiAuthorized(userId?: string | null): boolean {
  const id = resolveUserId(userId)
  if (id) {
    return localStorage.getItem(aiAuthorizedKey(id)) === 'true'
  }
  return false
}

export function setAiAuthorized(userId: string, value: boolean): void {
  localStorage.setItem(aiAuthorizedKey(userId), String(value))
}

