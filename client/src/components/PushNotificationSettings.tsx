import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, BellOff } from 'lucide-react'
import {
  disableCollaboratorChangePush,
  enableCollaboratorChangePush,
  fetchPushPrefs,
  getNotificationPermission,
  isPushSupported
} from '../services/pushNotifications.js'
import { isIosDevice, isRunningStandalone } from '../hooks/usePwaInstall.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { useDialog } from './ModalDialog.tsx'

export default function PushNotificationSettings() {
  const { t } = useTranslation()
  const { showAlert } = useDialog()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const supported = isPushSupported()
  const permission = getNotificationPermission()
  const iosNeedsInstall = isIosDevice() && !isRunningStandalone()

  const loadPrefs = useCallback(async () => {
    if (!supported) {
      setLoading(false)
      return
    }
    try {
      const prefs = await fetchPushPrefs()
      setEnabled(prefs.collaboratorChangesEnabled)
    } catch (err) {
      console.error('Failed to load push prefs:', err)
    } finally {
      setLoading(false)
    }
  }, [supported])

  useEffect(() => {
    void loadPrefs()
  }, [loadPrefs])

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setToggling(true)
    try {
      if (next) {
        await enableCollaboratorChangePush()
        setEnabled(true)
        trackPlausibleEvent(PlausibleEvents.PUSH_ENABLED)
      } else {
        await disableCollaboratorChangePush()
        setEnabled(false)
        trackPlausibleEvent(PlausibleEvents.PUSH_DISABLED)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('settings.push_error')
      showAlert(message)
      void loadPrefs()
    } finally {
      setToggling(false)
    }
  }

  if (!supported) {
    return (
      <div className="member-editor-card glass mt-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <BellOff size={20} style={{ color: '#94a3b8' }} />
          <h3 style={{ margin: 0, color: '#94a3b8', fontSize: '16px' }}>{t('settings.push_title')}</h3>
        </div>
        <p className="text-muted" style={{ fontSize: '13.5px', lineHeight: '145%', margin: 0 }}>
          {t('settings.push_unsupported')}
        </p>
      </div>
    )
  }

  return (
    <div className="member-editor-card glass mt-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Bell size={20} style={{ color: 'var(--app-accent-light)' }} />
        <h3 style={{ margin: 0, color: 'var(--app-accent-light)', fontSize: '16px' }}>
          {t('settings.push_title')}
        </h3>
      </div>

      <p className="text-muted" style={{ fontSize: '13.5px', lineHeight: '145%', margin: '0 0 16px 0' }}>
        {t('settings.push_desc')}
      </p>

      {iosNeedsInstall && (
        <p className="text-muted" style={{ fontSize: '13px', margin: '0 0 12px 0' }}>
          {t('settings.push_ios_install_hint')}
        </p>
      )}

      {permission === 'denied' && (
        <p style={{ fontSize: '13px', color: '#f87171', margin: '0 0 12px 0' }}>
          {t('settings.push_denied_hint')}
        </p>
      )}

      <label
        className="switch-label"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: loading || toggling || iosNeedsInstall ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          color: '#f1f5f9',
          opacity: loading || iosNeedsInstall ? 0.6 : 1
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          disabled={loading || toggling || iosNeedsInstall}
          style={{ width: '18px', height: '18px', cursor: 'inherit' }}
        />
        <span>{t('settings.push_enable')}</span>
      </label>

      {enabled && permission === 'granted' && (
        <p className="text-muted" style={{ fontSize: '12px', margin: '12px 0 0 0' }}>
          {t('settings.push_active')}
        </p>
      )}
    </div>
  )
}
