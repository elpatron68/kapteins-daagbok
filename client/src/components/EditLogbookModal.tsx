import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit2, X } from 'lucide-react'

interface EditLogbookModalProps {
  open: boolean
  onClose: () => void
  currentTitle: string
  onSave: (newTitle: string) => Promise<void>
}

export default function EditLogbookModal({ open, onClose, currentTitle, onSave }: EditLogbookModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(currentTitle)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(currentTitle)
      setError(null)
    }
  }, [open, currentTitle])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    if (trimmedTitle === currentTitle.trim()) {
      onClose()
      return
    }

    setLoading(true)
    setError(null)
    try {
      await onSave(trimmedTitle)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to rename logbook')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="custom-dialog-overlay" onClick={onClose}>
      <div className="custom-dialog-card glass scale-in" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="registration-disclaimer__close feedback-modal__close"
          onClick={onClose}
          disabled={loading}
          aria-label={t('feedback.cancel')}
          style={{ position: 'absolute', top: '12px', right: '12px' }}
        >
          <X size={18} />
        </button>

        <h3 className="custom-dialog-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Edit2 size={20} />
          {t('dashboard.edit_title')}
        </h3>

        <form onSubmit={handleSubmit} style={{ width: '100%', marginTop: '16px' }}>
          <div className="input-group" style={{ marginBottom: '20px' }}>
            <input
              type="text"
              className="input-text"
              placeholder={t('dashboard.edit_placeholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              required
              autoFocus
              style={{ width: '100%', textAlign: 'left' }}
            />
          </div>

          {error && <div className="auth-error" style={{ marginBottom: '16px', fontSize: '13px' }}>{error}</div>}

          <div className="custom-dialog-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={onClose}
              disabled={loading}
              style={{ width: 'auto', padding: '8px 20px', margin: 0 }}
            >
              {t('logs.cancel_event_edit')}
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={loading || !title.trim()}
              style={{ width: 'auto', minWidth: '80px', padding: '8px 20px', margin: 0 }}
            >
              {t('dashboard.edit_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
