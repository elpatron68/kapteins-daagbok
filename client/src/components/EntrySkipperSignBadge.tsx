import { useTranslation } from 'react-i18next'
import { AlertTriangle, Fingerprint } from 'lucide-react'
import type { SkipperSignStatus } from '../utils/signatures.js'

interface EntrySkipperSignBadgeProps {
  status: SkipperSignStatus
}

export default function EntrySkipperSignBadge({ status }: EntrySkipperSignBadgeProps) {
  const { t } = useTranslation()

  if (status === 'none') return null

  const isValid = status === 'valid'

  return (
    <span
      className={`entry-sign-badge entry-sign-badge--skipper ${isValid ? 'valid' : 'invalid'}`}
      title={
        isValid
          ? t('logs.sign_badge_skipper_title_valid')
          : t('logs.sign_badge_skipper_title_invalid')
      }
    >
      {isValid ? <Fingerprint size={12} /> : <AlertTriangle size={12} />}
      {isValid ? t('logs.sign_badge_skipper') : t('logs.sign_badge_skipper_invalid')}
    </span>
  )
}
