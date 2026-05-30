import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import CaptainCap from './icons/CaptainCap.tsx'
import type { SkipperSignStatus } from '../utils/signatures.js'

interface EntrySkipperSignBadgeProps {
  status: SkipperSignStatus
}

export default function EntrySkipperSignBadge({ status }: EntrySkipperSignBadgeProps) {
  const { t } = useTranslation()

  if (status === 'none') return null

  const isValid = status === 'valid'
  const label = isValid
    ? t('logs.sign_badge_skipper_title_valid')
    : t('logs.sign_badge_skipper_title_invalid')

  return (
    <span
      className={`entry-sign-badge entry-sign-badge--skipper ${isValid ? 'valid' : 'invalid'}`}
      title={label}
      aria-label={label}
    >
      {isValid ? <CaptainCap size={14} /> : <AlertTriangle size={12} />}
      {!isValid && t('logs.sign_badge_skipper_invalid')}
    </span>
  )
}
