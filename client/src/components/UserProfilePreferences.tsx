import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Compass, Palette, Save, Check, Cloud, Brain } from 'lucide-react'
import ThemedSelect from './ThemedSelect.tsx'
import PushNotificationSettings from './PushNotificationSettings.tsx'
import PwaInstallPrompt from './PwaInstallPrompt.tsx'
import { notifyAppearanceChanged } from '../services/appearance.js'
import { saveAppearancePrefsToServer } from '../services/appearancePrefs.js'
import { useAppTour } from '../context/AppTourContext.tsx'
import {
  getColorSchemePreference,
  getOwmApiKey,
  getThemePreference,
  setColorSchemePreference,
  setOwmApiKey,
  setThemePreference,
  getAiAuthorized,
  setAiAuthorized
} from '../services/userPreferences.js'

interface UserProfilePreferencesProps {
  userId: string
}

export default function UserProfilePreferences({ userId }: UserProfilePreferencesProps) {
  const { t } = useTranslation()
  const { restartTour } = useAppTour()
  const [apiKey, setApiKey] = useState(() => getOwmApiKey(userId))
  const [theme, setTheme] = useState(() => getThemePreference(userId))
  const [colorScheme, setColorScheme] = useState(() => getColorSchemePreference(userId))
  const [savingOwm, setSavingOwm] = useState(false)
  const [owmSaved, setOwmSaved] = useState(false)
  const [aiAuthorized, setAiAuthorizedState] = useState(() => getAiAuthorized(userId))

  useEffect(() => {
    const handleChanged = () => {
      setTheme(getThemePreference(userId))
      setColorScheme(getColorSchemePreference(userId))
      setAiAuthorizedState(getAiAuthorized(userId))
    }
    window.addEventListener('appearance-changed', handleChanged)
    return () => {
      window.removeEventListener('appearance-changed', handleChanged)
    }
  }, [userId])

  const persistAppearance = (nextTheme: string, nextColorScheme: string) => {
    setThemePreference(userId, nextTheme)
    setColorSchemePreference(userId, nextColorScheme)
    notifyAppearanceChanged()
    void saveAppearancePrefsToServer(nextTheme, nextColorScheme, aiAuthorized, userId).catch((err) => {
      console.warn('Failed to save appearance prefs to server:', err)
    })
  }

  const handleThemeChange = (nextTheme: string) => {
    setTheme(nextTheme)
    persistAppearance(nextTheme, colorScheme)
  }

  const handleColorSchemeChange = (nextColorScheme: string) => {
    setColorScheme(nextColorScheme)
    persistAppearance(theme, nextColorScheme)
  }

  const handleSaveOwm = (e: React.FormEvent) => {
    e.preventDefault()
    setSavingOwm(true)
    setOwmSaved(false)
    setOwmApiKey(userId, apiKey)
    setSavingOwm(false)
    setOwmSaved(true)
    window.setTimeout(() => setOwmSaved(false), 3000)
  }

  const handleAiToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.checked
    setAiAuthorizedState(nextVal)
    setAiAuthorized(userId, nextVal)
    void saveAppearancePrefsToServer(theme, colorScheme, nextVal, userId).catch((err) => {
      console.warn('Failed to save ai preference to server:', err)
    })
  }

  return (
    <>
      <section className="member-editor-card glass">
        <div className="profile-section-header">
          <Palette size={20} />
          <h3>{t('profile.appearance_title')}</h3>
        </div>
        <p className="profile-section-desc">{t('profile.appearance_desc')}</p>

        <div className="input-group">
          <label htmlFor="profile-app-theme" className="profile-field-label">
            {t('profile.theme_label')}
          </label>
          <ThemedSelect
            id="profile-app-theme"
            value={theme}
            onChange={handleThemeChange}
            options={[
              { value: 'auto', label: t('profile.theme_auto') },
              { value: 'ocean', label: t('profile.theme_ocean') },
              { value: 'material', label: t('profile.theme_material') },
              { value: 'cupertino', label: t('profile.theme_cupertino') }
            ]}
          />
        </div>

        <div className="input-group mt-4">
          <label htmlFor="profile-color-scheme" className="profile-field-label">
            {t('profile.color_scheme_label')}
          </label>
          <ThemedSelect
            id="profile-color-scheme"
            value={colorScheme}
            onChange={handleColorSchemeChange}
            options={[
              { value: 'auto', label: t('profile.color_scheme_auto') },
              { value: 'light', label: t('profile.color_scheme_light') },
              { value: 'dark', label: t('profile.color_scheme_dark') }
            ]}
          />
        </div>
      </section>

      <section className="member-editor-card glass">
        <div className="profile-section-header">
          <Compass size={20} />
          <h3>{t('profile.tour_title')}</h3>
        </div>
        <p className="profile-section-desc">{t('profile.tour_desc')}</p>
        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={() => restartTour()}>
            {t('profile.tour_restart')}
          </button>
        </div>
      </section>

      <section className="member-editor-card glass">
        <div className="profile-section-header">
          <Cloud size={20} />
          <h3>{t('profile.integrations_title')}</h3>
        </div>
        <p className="profile-section-desc">{t('profile.owm_help')}</p>
        <form onSubmit={handleSaveOwm}>
          <div className="input-group">
            <label htmlFor="profile-owm-api-key" className="profile-field-label">
              {t('profile.owm_key')}
            </label>
            <input
              id="profile-owm-api-key"
              name="owm-api-key"
              type="password"
              className="input-text"
              placeholder="e.g. 8b6a7f...d8"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={savingOwm}
              autoComplete="off"
            />
          </div>
          <div className="form-actions mt-4">
            {owmSaved && (
              <div className="success-toast">
                <Check size={16} />
                <span>{t('profile.prefs_saved')}</span>
              </div>
            )}
            <button type="submit" className="btn primary" disabled={savingOwm}>
              <Save size={18} />
              {savingOwm ? t('profile.prefs_saving') : t('profile.prefs_save')}
            </button>
          </div>
        </form>
      </section>

      <section className="member-editor-card glass">
        <div className="profile-section-header">
          <Brain size={20} style={{ color: 'var(--app-accent-light)' }} />
          <h3 style={{ margin: 0, color: 'var(--app-accent-light)', fontSize: '16px' }}>
            {t('profile.ai_title')}
          </h3>
        </div>
        <p className="text-muted" style={{ fontSize: '13.5px', lineHeight: '145%', margin: '0 0 12px 0' }}>
          {t('profile.ai_desc')}
        </p>
        <p className="text-muted" style={{ fontSize: '13px', lineHeight: '145%', margin: '0 0 16px 0', whiteSpace: 'pre-line' }}>
          {t('profile.ai_help')}
        </p>

        <label
          className="switch-label"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#f1f5f9'
          }}
        >
          <input
            id="profile-ai-authorize"
            type="checkbox"
            checked={aiAuthorized}
            onChange={handleAiToggle}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <span>{t('profile.ai_enable_label')}</span>
        </label>
      </section>

      <PushNotificationSettings />
      <PwaInstallPrompt variant="inline" />
    </>
  )
}
