import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, X } from 'lucide-react'
import { FeedbackApiError, sendFeedback, type FeedbackCategory } from '../services/feedback.js'
import { useDialog } from './ModalDialog.tsx'

interface FeedbackModalProps {
  open: boolean
  onClose: () => void
  logbookId?: string | null
  logbookTitle?: string | null
}

export default function FeedbackModal({
  open,
  onClose,
  logbookId,
  logbookTitle
}: FeedbackModalProps) {
  const { t } = useTranslation()
  const { showAlert } = useDialog()
  const [category, setCategory] = useState<FeedbackCategory>('general')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sending) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, sending])

  useEffect(() => {
    if (!open) {
      setCategory('general')
      setMessage('')
      setSending(false)
    }
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!message.trim() || sending) return

    setSending(true)
    try {
      await sendFeedback({
        category,
        message: message.trim(),
        logbookId,
        logbookTitle
      })
      await showAlert(t('feedback.success'), t('feedback.title'))
      onClose()
    } catch (error) {
      const msg =
        error instanceof FeedbackApiError && error.code === 'NOT_CONFIGURED'
          ? t('feedback.error_not_configured')
          : t('feedback.error_send')
      await showAlert(msg, t('feedback.title'))
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div className="disclaimer-modal-overlay" onClick={sending ? undefined : onClose}>
      <div className="disclaimer-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="auth-card glass registration-disclaimer registration-disclaimer--modal feedback-modal">
          <div className="auth-header">
            <MessageSquarePlus className="auth-icon accent" size={48} />
            <h2>{t('feedback.title')}</h2>
            <button
              type="button"
              className="registration-disclaimer__close"
              onClick={onClose}
              disabled={sending}
              aria-label={t('feedback.cancel')}
            >
              <X size={18} />
            </button>
          </div>

          <p className="registration-disclaimer__intro">{t('feedback.intro')}</p>

          <form className="feedback-form" onSubmit={handleSubmit}>
            <label className="feedback-form__field">
              <span>{t('feedback.category_label')}</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                disabled={sending}
              >
                <option value="general">{t('feedback.category_general')}</option>
                <option value="bug">{t('feedback.category_bug')}</option>
                <option value="feature">{t('feedback.category_feature')}</option>
              </select>
            </label>

            <label className="feedback-form__field">
              <span>{t('feedback.message_label')}</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t('feedback.message_placeholder')}
                rows={6}
                maxLength={2000}
                required
                disabled={sending}
              />
            </label>

            <div className="auth-actions feedback-form__actions">
              <button type="button" className="btn secondary" onClick={onClose} disabled={sending}>
                {t('feedback.cancel')}
              </button>
              <button type="submit" className="btn primary" disabled={sending || !message.trim()}>
                {sending ? t('feedback.sending') : t('feedback.send')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
