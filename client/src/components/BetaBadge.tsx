import { useTranslation } from 'react-i18next'

interface BetaBadgeProps {
  className?: string
}

export default function BetaBadge({ className = '' }: BetaBadgeProps) {
  const { t } = useTranslation()

  return (
    <span
      className={`beta-badge ${className}`.trim()}
      title={t('app.beta_hint')}
      aria-label={t('app.beta_hint')}
    >
      {t('app.beta')}
    </span>
  )
}
