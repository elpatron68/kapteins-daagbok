import { useTranslation } from 'react-i18next'
import { User } from 'lucide-react'

interface ProfileHeaderButtonProps {
  onClick: () => void
}

export default function ProfileHeaderButton({ onClick }: ProfileHeaderButtonProps) {
  const { t } = useTranslation()
  const username = localStorage.getItem('active_username') || 'Skipper'

  return (
    <button
      type="button"
      className="btn-icon skipper-badge"
      onClick={onClick}
      title={t('dashboard.open_profile', { name: username })}
      aria-label={t('dashboard.open_profile', { name: username })}
      data-tour="nav-profile"
    >
      <User size={18} aria-hidden="true" />
      <span className="skipper-badge__name">{username}</span>
    </button>
  )
}
