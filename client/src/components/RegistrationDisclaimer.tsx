import { useTranslation } from 'react-i18next'
import { ScrollText, X } from 'lucide-react'

export type DisclaimerVariant = 'accept' | 'view'

interface RegistrationDisclaimerProps {
  onDismiss: () => void
  variant?: DisclaimerVariant
}

export default function RegistrationDisclaimer({
  onDismiss,
  variant = 'accept'
}: RegistrationDisclaimerProps) {
  const { t } = useTranslation()

  const sections = [
    { title: t('disclaimer.e2e_title'), body: t('disclaimer.e2e_body') },
    { title: t('disclaimer.pwa_title'), body: t('disclaimer.pwa_body') },
    { title: t('disclaimer.storage_title'), body: t('disclaimer.storage_body') },
    { title: t('disclaimer.free_title'), body: t('disclaimer.free_body') },
    { title: t('disclaimer.liability_title'), body: t('disclaimer.liability_body') },
    { title: t('disclaimer.warranty_title'), body: t('disclaimer.warranty_body') }
  ]

  return (
    <div
      className={`auth-card glass registration-disclaimer${variant === 'view' ? ' registration-disclaimer--modal' : ''}`}
      role="document"
    >
      {variant === 'view' && (
        <button
          type="button"
          className="registration-disclaimer__close"
          onClick={onDismiss}
          aria-label={t('disclaimer.close')}
        >
          <X size={18} />
        </button>
      )}
      <div className="auth-header">
        <ScrollText className="auth-icon accent" size={48} />
        <h2>{t('disclaimer.title')}</h2>
      </div>

      <p className="registration-disclaimer__intro">{t('disclaimer.intro')}</p>

      <div className="registration-disclaimer__sections">
        {sections.map((section) => (
          <section key={section.title} className="registration-disclaimer__section">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </section>
        ))}
      </div>

      <p className="registration-disclaimer__copyright">{t('disclaimer.copyright')}</p>

      <div className="auth-actions">
        <button type="button" className="btn primary" onClick={onDismiss}>
          {variant === 'accept' ? t('disclaimer.accept') : t('disclaimer.close')}
        </button>
      </div>
    </div>
  )
}
