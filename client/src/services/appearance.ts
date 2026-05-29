export type ColorSchemePreference = 'auto' | 'light' | 'dark'
export type ResolvedColorScheme = 'light' | 'dark'
export type AppTheme = 'ocean' | 'material' | 'cupertino'

const THEME_CLASSES = ['theme-ocean', 'theme-material', 'theme-cupertino'] as const
const SCHEME_CLASSES = ['scheme-light', 'scheme-dark'] as const

export function getColorSchemePreference(): ColorSchemePreference {
  const stored = localStorage.getItem('active_color_scheme')
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  return 'auto'
}

export function resolveColorScheme(pref?: ColorSchemePreference): ResolvedColorScheme {
  const preference = pref ?? getColorSchemePreference()
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveAppTheme(): AppTheme {
  const configTheme = localStorage.getItem('active_theme') || 'auto'
  if (configTheme === 'material' || configTheme === 'cupertino' || configTheme === 'ocean') {
    return configTheme
  }
  const userAgent = navigator.userAgent || navigator.vendor || ''
  if (/iPad|iPhone|iPod|Macintosh/.test(userAgent)) return 'cupertino'
  if (/Android|Linux/.test(userAgent)) return 'material'
  return 'ocean'
}

export function applyAppearanceToDocument(
  theme: AppTheme = resolveAppTheme(),
  scheme: ResolvedColorScheme = resolveColorScheme()
): void {
  const root = document.documentElement
  root.classList.remove(...THEME_CLASSES, ...SCHEME_CLASSES)
  root.classList.add(`theme-${theme}`, `scheme-${scheme}`)
  root.style.colorScheme = scheme
}

export function subscribeToSystemColorScheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (getColorSchemePreference() === 'auto') onChange()
  }
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}

export function notifyAppearanceChanged(): void {
  window.dispatchEvent(new Event('appearance-changed'))
}
