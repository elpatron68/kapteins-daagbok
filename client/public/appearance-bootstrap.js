/**
 * Applies saved appearance classes before CSS/JS bundle loads (prevents wrong flash on PWA).
 * Logic mirrors client/src/services/appearance.ts + userPreferences.ts.
 */
(function () {
  try {
    var uid = localStorage.getItem('active_userid')
    var theme = 'auto'
    var scheme = 'auto'

    if (uid) {
      theme =
        localStorage.getItem('user_pref_theme_' + uid) ||
        localStorage.getItem('active_theme') ||
        'auto'
      scheme =
        localStorage.getItem('user_pref_color_scheme_' + uid) ||
        localStorage.getItem('active_color_scheme') ||
        'auto'
    } else {
      theme = localStorage.getItem('active_theme') || 'auto'
      scheme = localStorage.getItem('active_color_scheme') || 'auto'
    }

    var resolvedTheme = theme
    if (resolvedTheme !== 'ocean' && resolvedTheme !== 'material' && resolvedTheme !== 'cupertino') {
      var ua = navigator.userAgent || navigator.vendor || ''
      if (/iPad|iPhone|iPod|Macintosh/.test(ua)) resolvedTheme = 'cupertino'
      else if (/Android|Linux/.test(ua)) resolvedTheme = 'material'
      else resolvedTheme = 'ocean'
    }

    var resolvedScheme = scheme
    if (resolvedScheme !== 'light' && resolvedScheme !== 'dark') {
      resolvedScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    var root = document.documentElement
    root.classList.add('theme-' + resolvedTheme, 'scheme-' + resolvedScheme)
    root.style.colorScheme = resolvedScheme
  } catch (_) {
    /* ignore storage / matchMedia errors */
  }
})()
