import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calendar,
  Download,
  FileText,
  List,
  Share2,
  Trash2,
  X
} from 'lucide-react'

interface LiveOverflowMenuProps {
  open: boolean
  onClose: () => void
  onOpenAllDays: () => void
  onOpenEditor: () => void
  onDownloadCsv: () => void
  onShareCsv: () => void
  onDownloadPhotosZip?: () => void
  onDownloadPdf: () => void
  onDeleteEntry?: () => void
  exporting?: boolean
  canExportPhotosZip?: boolean
  hasEntries?: boolean
  entryId?: string | null
}

export default function LiveOverflowMenu({
  open,
  onClose,
  onOpenAllDays,
  onOpenEditor,
  onDownloadCsv,
  onShareCsv,
  onDownloadPhotosZip,
  onDownloadPdf,
  onDeleteEntry,
  exporting = false,
  canExportPhotosZip = false,
  hasEntries = true,
  entryId
}: LiveOverflowMenuProps) {
  const { t } = useTranslation()
  const firstBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) firstBtnRef.current?.focus()
  }, [open])

  if (!open) return null

  const disabled = exporting || !hasEntries

  const run = (fn: () => void) => {
    fn()
    onClose()
  }

  return (
    <div
      className="live-bottom-sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        className="live-bottom-sheet live-overflow-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-overflow-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="live-bottom-sheet-handle" aria-hidden />
        <div className="live-bottom-sheet-header">
          <h3 id="live-overflow-title">{t('logs.more_actions')}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t('logs.live_cancel')}>
            <X size={18} />
          </button>
        </div>

        <div className="live-overflow-menu-list">
          <button
            ref={firstBtnRef}
            type="button"
            className="live-overflow-menu-item"
            onClick={() => run(onOpenAllDays)}
          >
            <List size={18} />
            {t('logs.all_days')}
          </button>

          {entryId && (
            <button
              type="button"
              className="live-overflow-menu-item"
              onClick={() => run(onOpenEditor)}
            >
              <FileText size={18} />
              {t('logs.live_open_editor')}
            </button>
          )}

          <button
            type="button"
            className="live-overflow-menu-item"
            onClick={() => run(onDownloadCsv)}
            disabled={disabled}
          >
            <Download size={18} />
            {exporting ? t('logs.exporting') : t('logs.export_csv')}
          </button>

          <button
            type="button"
            className="live-overflow-menu-item"
            onClick={() => run(onShareCsv)}
            disabled={disabled}
          >
            <Share2 size={18} />
            {t('logs.share_csv')}
          </button>

          {canExportPhotosZip && onDownloadPhotosZip && (
            <button
              type="button"
              className="live-overflow-menu-item"
              onClick={() => run(onDownloadPhotosZip)}
              disabled={disabled}
            >
              <Download size={18} />
              {exporting ? t('logs.exporting_photos_zip') : t('logs.export_photos_zip')}
            </button>
          )}

          {entryId && (
            <button
              type="button"
              className="live-overflow-menu-item"
              onClick={() => run(onDownloadPdf)}
              disabled={exporting}
            >
              <Calendar size={18} />
              {t('logs.export_pdf')}
            </button>
          )}

          {onDeleteEntry && entryId && (
            <button
              type="button"
              className="live-overflow-menu-item live-overflow-menu-item-danger"
              onClick={() => run(onDeleteEntry)}
              disabled={exporting}
            >
              <Trash2 size={18} />
              {t('logs.delete_entry')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
