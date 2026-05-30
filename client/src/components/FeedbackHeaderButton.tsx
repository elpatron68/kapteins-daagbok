import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus } from 'lucide-react'
import FeedbackModal from './FeedbackModal.tsx'

interface FeedbackHeaderButtonProps {
  logbookId?: string | null
  logbookTitle?: string | null
}

export default function FeedbackHeaderButton({
  logbookId,
  logbookTitle
}: FeedbackHeaderButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn-icon"
        onClick={() => setOpen(true)}
        title={t('feedback.button_title')}
        aria-label={t('feedback.button_title')}
      >
        <MessageSquarePlus size={18} />
      </button>
      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        logbookId={logbookId}
        logbookTitle={logbookTitle}
      />
    </>
  )
}
