import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, X } from 'lucide-react'
import type { LogEventPayload } from '../utils/logEntryPayload.js'
import { isValidTimeHHMM } from '../utils/logEntryPayload.js'

interface LiveEventSheetProps {
  open: boolean
  event: LogEventPayload | null
  eventIndex: number | null
  onClose: () => void
  onSave: (index: number, patch: Partial<LogEventPayload>) => Promise<void>
  onDelete: (index: number) => Promise<void>
  onOpenEditor?: () => void
  busy?: boolean
}

export default function LiveEventSheet({
  open,
  event,
  eventIndex,
  onClose,
  onSave,
  onDelete,
  onOpenEditor,
  busy = false
}: LiveEventSheetProps) {
  const { t } = useTranslation()
  const timeRef = useRef<HTMLInputElement>(null)
  const remarksRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open || !event) return
    if (timeRef.current) timeRef.current.value = event.time || ''
    if (remarksRef.current) remarksRef.current.value = event.remarks || ''
  }, [open, event])

  if (!open || !event || eventIndex === null) return null

  const handleSave = async () => {
    const time = timeRef.current?.value.trim() ?? ''
    const remarks = remarksRef.current?.value ?? ''
    if (!isValidTimeHHMM(time)) return
    await onSave(eventIndex, { time, remarks })
    onClose()
  }

  const handleDelete = async () => {
    await onDelete(eventIndex)
    onClose()
  }

  return (
    <div
      className="live-bottom-sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="live-bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-event-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="live-bottom-sheet-handle" aria-hidden />
        <div className="live-bottom-sheet-header">
          <h3 id="live-event-sheet-title">{t('logs.live_edit_event')}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('logs.live_cancel')}>
            <X size={18} />
          </button>
        </div>

        <div className="live-event-sheet-form">
          <label className="live-event-sheet-field">
            <span>{t('logs.event_time')}</span>
            <input
              ref={timeRef}
              type="text"
              className="input-text"
              inputMode="numeric"
              placeholder="HH:MM"
              maxLength={5}
            />
          </label>
          <label className="live-event-sheet-field">
            <span>{t('logs.event_remarks')}</span>
            <textarea
              ref={remarksRef}
              className="input-text"
              rows={3}
            />
          </label>
        </div>

        <div className="live-bottom-sheet-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => void handleSave()}
            disabled={busy}
          >
            <Pencil size={16} />
            {t('logs.save')}
          </button>
          <button
            type="button"
            className="btn secondary danger-text"
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            <Trash2 size={16} />
            {t('logs.live_delete_event')}
          </button>
          {onOpenEditor && (
            <button type="button" className="btn secondary" onClick={onOpenEditor} disabled={busy}>
              {t('logs.live_open_editor')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
