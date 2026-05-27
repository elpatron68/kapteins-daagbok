import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Save, Check } from 'lucide-react'

export default function SettingsForm() {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState(localStorage.getItem('owm_api_key') || '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    
    // Save to localStorage
    localStorage.setItem('owm_api_key', apiKey.trim())
    
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="form-card">
      <div className="form-header">
        <Settings size={24} className="form-icon" />
        <div>
          <h2>{t('settings.title')}</h2>
          <p className="form-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            {t('settings.subtitle')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="vessel-form mt-6">
        <div className="member-editor-card glass">
          <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#fbbf24', fontSize: '16px' }}>
            {t('settings.owm_title')}
          </h3>
          <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: '145%', margin: '0 0 16px 0' }}>
            {t('settings.key_help')}
          </p>

          <div className="input-group">
            <label htmlFor="owm-api-key" style={{ display: 'block', fontSize: '13.5px', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
              {t('settings.owm_key')}
            </label>
            <input
              id="owm-api-key"
              type="password"
              className="input-text"
              placeholder="e.g. 8b6a7f...d8"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-actions mt-4">
          {success && (
            <div className="success-toast">
              <Check size={16} />
              <span>{t('settings.saved')}</span>
            </div>
          )}
          
          <button type="submit" className="btn primary" disabled={saving}>
            <Save size={18} />
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
