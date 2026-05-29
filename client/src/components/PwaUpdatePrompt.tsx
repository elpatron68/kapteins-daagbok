import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, X } from 'lucide-react'
import { usePwaUpdate } from '../hooks/usePwaUpdate.js'

export default function PwaUpdatePrompt() {
  const { t } = useTranslation()
  const { needRefresh, updateApp } = usePwaUpdate()
  const [updating, setUpdating] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (!needRefresh || dismissed) return null

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      await updateApp()
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="pwa-update-banner" role="alert" aria-live="polite">
      <div className="pwa-update-icon" aria-hidden="true">
        <RefreshCw size={22} />
      </div>

      <div className="pwa-update-body">
        <p className="pwa-update-title">{t('pwa.update_title')}</p>
        <p className="pwa-update-text">{t('pwa.update_desc')}</p>
      </div>

      <div className="pwa-update-actions">
        <button
          type="button"
          className="btn primary pwa-update-btn"
          onClick={handleUpdate}
          disabled={updating}
        >
          {updating ? t('pwa.update_reloading') : t('pwa.update_now')}
        </button>
        <button
          type="button"
          className="pwa-update-link"
          onClick={() => setDismissed(true)}
        >
          {t('pwa.later')}
        </button>
      </div>

      <button
        type="button"
        className="pwa-update-close"
        onClick={() => setDismissed(true)}
        aria-label={t('pwa.later')}
      >
        <X size={18} />
      </button>
    </div>
  )
}
