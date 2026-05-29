import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Share, Smartphone, X } from 'lucide-react'
import { usePwaInstall, isIosDevice, type PwaInstallPlatform } from '../hooks/usePwaInstall.js'

interface PwaInstallPromptProps {
  variant?: 'banner' | 'inline'
}

function platformLabel(platform: PwaInstallPlatform | null, t: (key: string) => string): string {
  if (platform === 'ios') return t('pwa.platform_ios')
  if (platform === 'android') return t('pwa.platform_android')
  return t('pwa.platform_desktop')
}

export default function PwaInstallPrompt({ variant = 'banner' }: PwaInstallPromptProps) {
  const { t } = useTranslation()
  const { canPrompt, platform, install, dismissLater, dismissForever, isStandalone, hasNativeInstall } =
    usePwaInstall()
  const [installing, setInstalling] = useState(false)

  if (isStandalone) return null
  if (variant === 'banner' && !canPrompt) return null
  if (variant === 'inline' && !isIosDevice() && !hasNativeInstall) return null

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await install()
    } finally {
      setInstalling(false)
    }
  }

  const rootClass = variant === 'banner' ? 'pwa-install-banner glass' : 'pwa-install-inline glass'

  return (
    <div className={rootClass} role="region" aria-label={t('pwa.title')}>
      <div className="pwa-install-icon">
        <Smartphone size={variant === 'banner' ? 28 : 24} />
      </div>

      <div className="pwa-install-body">
        <h3 className="pwa-install-title">{t('pwa.title')}</h3>
        <p className="pwa-install-text">
          {platform === 'ios' ? t('pwa.ios_instructions') : t('pwa.generic_benefit')}
        </p>

        {platform === 'ios' && (
          <ol className="pwa-install-steps">
            <li>
              <Share size={16} aria-hidden />
              <span>{t('pwa.ios_step_share')}</span>
            </li>
            <li>
              <span className="pwa-ios-add-icon" aria-hidden>+</span>
              <span>{t('pwa.ios_step_add')}</span>
            </li>
          </ol>
        )}

        {hasNativeInstall && (
          <p className="pwa-install-hint">{platformLabel(platform, t)}</p>
        )}
      </div>

      <div className="pwa-install-actions">
        {hasNativeInstall && (
          <button
            type="button"
            className="btn primary pwa-install-btn"
            onClick={handleInstall}
            disabled={installing}
          >
            <Download size={16} />
            {installing ? t('pwa.installing') : t('pwa.install_now')}
          </button>
        )}

        {variant === 'banner' && (
          <div className="pwa-install-dismiss-row">
            <button type="button" className="pwa-install-link" onClick={dismissLater}>
              {t('pwa.later')}
            </button>
            <button type="button" className="pwa-install-link muted" onClick={dismissForever}>
              {t('pwa.never')}
            </button>
          </div>
        )}
      </div>

      {variant === 'banner' && (
        <button
          type="button"
          className="pwa-install-close"
          onClick={dismissLater}
          aria-label={t('pwa.later')}
        >
          <X size={18} />
        </button>
      )}
    </div>
  )
}
