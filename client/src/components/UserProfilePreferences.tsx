import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Compass, Palette, Save, Check, Cloud } from 'lucide-react'
import ThemedSelect from './ThemedSelect.tsx'
import PushNotificationSettings from './PushNotificationSettings.tsx'
import PwaInstallPrompt from './PwaInstallPrompt.tsx'
import { notifyAppearanceChanged } from '../services/appearance.js'
import { useAppTour } from '../context/AppTourContext.tsx'
import {
  getColorSchemePreference,
  getOwmApiKey,
  getThemePreference,
  setColorSchemePreference,
  setOwmApiKey,
  setThemePreference
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

  const persistAppearance = (nextTheme: string, nextColorScheme: string) => {
    setThemePreference(userId, nextTheme)
    setColorSchemePreference(userId, nextColorScheme)
    notifyAppearanceChanged()
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

      <PushNotificationSettings />
      <PwaInstallPrompt variant="inline" />
    </>
  )
}
