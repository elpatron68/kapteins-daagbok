import { useTranslation } from 'react-i18next'
import { Anchor, Eye, Users } from 'lucide-react'
import type { LogbookAccessRole } from '../services/logbook.js'

interface LogbookRoleBadgeProps {
  role: LogbookAccessRole
  className?: string
}

export default function LogbookRoleBadge({ role, className = '' }: LogbookRoleBadgeProps) {
  const { t } = useTranslation()

  if (role === 'OWNER') {
    return (
      <span className={`role-badge role-badge--owner ${className}`.trim()} title={t('dashboard.role_owner_hint')}>
        <Anchor size={12} aria-hidden="true" />
        {t('dashboard.role_owner')}
      </span>
    )
  }

  if (role === 'READ') {
    return (
      <span className={`role-badge role-badge--read ${className}`.trim()} title={t('dashboard.role_read_hint')}>
        <Eye size={12} aria-hidden="true" />
        {t('dashboard.role_read')}
      </span>
    )
  }

  return (
    <span className={`role-badge role-badge--crew ${className}`.trim()} title={t('dashboard.role_crew_hint')}>
      <Users size={12} aria-hidden="true" />
      {t('dashboard.role_crew')}
    </span>
  )
}
