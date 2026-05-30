import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus } from 'lucide-react'
import FeedbackModal from './FeedbackModal.tsx'

interface FeedbackHeaderButtonProps {
  logbookId?: string | null
  logbookTitle?: string | null
  tourOpen?: boolean
  onTourOpenChange?: (open: boolean) => void
  tourHighlight?: boolean
}

export default function FeedbackHeaderButton({
  logbookId,
  logbookTitle,
  tourOpen = false,
  onTourOpenChange,
  tourHighlight = false
}: FeedbackHeaderButtonProps) {
  const { t } = useTranslation()
  const [userOpen, setUserOpen] = useState(false)
  const open = tourOpen || userOpen

  const handleClose = () => {
    setUserOpen(false)
    onTourOpenChange?.(false)
  }

  return (
    <>
      <button
        type="button"
        className="btn-icon"
        onClick={() => setUserOpen(true)}
        title={t('feedback.button_title')}
        aria-label={t('feedback.button_title')}
        data-tour="feedback-button"
      >
        <MessageSquarePlus size={18} />
      </button>
      <FeedbackModal
        open={open}
        onClose={handleClose}
        logbookId={logbookId}
        logbookTitle={logbookTitle}
        tourMode={tourHighlight}
      />
    </>
  )
}
