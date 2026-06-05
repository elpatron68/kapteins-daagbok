import { useTranslation } from 'react-i18next'
import { LayoutDashboard } from 'lucide-react'

interface AdminHeaderButtonProps {
  onClick: () => void
}

export default function AdminHeaderButton({ onClick }: AdminHeaderButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className="btn-icon skipper-badge"
      onClick={onClick}
      title={t('nav.admin')}
      aria-label={t('nav.admin')}
    >
      <LayoutDashboard size={18} aria-hidden="true" />
      <span className="skipper-badge__name">{t('nav.admin')}</span>
    </button>
  )
}
