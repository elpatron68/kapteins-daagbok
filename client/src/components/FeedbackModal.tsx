import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, MessageSquarePlus, X } from 'lucide-react'
import { FeedbackApiError, sendFeedback, type FeedbackCategory } from '../services/feedback.js'

const SUCCESS_CLOSE_DELAY_MS = 1800

interface FeedbackModalProps {
  open: boolean
  onClose: () => void
  logbookId?: string | null
  logbookTitle?: string | null
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error'

export default function FeedbackModal({
  open,
  onClose,
  logbookId,
  logbookTitle
}: FeedbackModalProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<FeedbackCategory>('general')
  const [message, setMessage] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const isBusy = submitState === 'submitting' || submitState === 'success'

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => clearCloseTimer()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, isBusy])

  useEffect(() => {
    if (!open) {
      clearCloseTimer()
      setCategory('general')
      setMessage('')
      setSubmitState('idle')
      setStatusMessage(null)
    }
  }, [open])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!message.trim() || submitState === 'submitting' || submitState === 'success') return

    setSubmitState('submitting')
    setStatusMessage(null)

    try {
      await sendFeedback({
        category,
        message: message.trim(),
        logbookId,
        logbookTitle
      })
      setSubmitState('success')
      setStatusMessage(t('feedback.success'))
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null
        onClose()
      }, SUCCESS_CLOSE_DELAY_MS)
    } catch (error) {
      setSubmitState('error')
      setStatusMessage(
        error instanceof FeedbackApiError && error.code === 'NOT_CONFIGURED'
          ? t('feedback.error_not_configured')
          : t('feedback.error_send')
      )
    }
  }

  if (!open) return null

  return (
    <div className="disclaimer-modal-overlay" onClick={isBusy ? undefined : onClose}>
      <div className="disclaimer-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="auth-card glass registration-disclaimer registration-disclaimer--modal feedback-modal">
          <button
            type="button"
            className="registration-disclaimer__close feedback-modal__close"
            onClick={onClose}
            disabled={isBusy}
            aria-label={t('feedback.cancel')}
          >
            <X size={18} />
          </button>

          <div className="auth-header">
            <MessageSquarePlus className="auth-icon accent" size={48} />
            <h2>{t('feedback.title')}</h2>
          </div>

          {submitState === 'success' ? (
            <div className="feedback-status feedback-status--success" role="status" aria-live="polite">
              <CheckCircle2 size={40} aria-hidden="true" />
              <p>{statusMessage}</p>
            </div>
          ) : (
            <>
              <p className="registration-disclaimer__intro">{t('feedback.intro')}</p>

              {statusMessage && submitState === 'error' && (
                <div className="feedback-status feedback-status--error" role="alert">
                  <p>{statusMessage}</p>
                </div>
              )}

              <form className="feedback-form" onSubmit={handleSubmit}>
                <label className="feedback-form__field">
                  <span>{t('feedback.category_label')}</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                    disabled={submitState === 'submitting'}
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
                    onChange={(event) => {
                      setMessage(event.target.value)
                      if (submitState === 'error') {
                        setSubmitState('idle')
                        setStatusMessage(null)
                      }
                    }}
                    placeholder={t('feedback.message_placeholder')}
                    rows={6}
                    maxLength={2000}
                    required
                    disabled={submitState === 'submitting'}
                  />
                </label>

                <div className="auth-actions feedback-form__actions">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={onClose}
                    disabled={submitState === 'submitting'}
                  >
                    {t('feedback.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={submitState === 'submitting' || !message.trim()}
                  >
                    {submitState === 'submitting' ? t('feedback.sending') : t('feedback.send')}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
