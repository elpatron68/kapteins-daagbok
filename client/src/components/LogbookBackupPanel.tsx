import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Download, Upload, Check, AlertTriangle } from 'lucide-react'
import { useDialog } from './ModalDialog.tsx'
import {
  downloadBackupBlob,
  exportLogbookBackup,
  parseLogbookBackupFile,
  previewLogbookBackup,
  restoreLogbookBackup,
  type LogbookBackupFile,
  type LogbookBackupPreview
} from '../services/logbookBackup.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

interface LogbookBackupPanelProps {
  logbookId: string
  onRestored?: (logbookId: string, title: string) => void
}

function mapBackupError(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'BACKUP_PASSPHRASE_TOO_SHORT':
      return t('settings.backup_passphrase_short')
    case 'BACKUP_NOT_OWNER':
      return t('settings.backup_not_owner')
    case 'BACKUP_INVALID_JSON':
      return t('settings.backup_invalid_json')
    case 'BACKUP_INVALID_FORMAT':
      return t('settings.backup_invalid_format')
    case 'BACKUP_NOT_AUTHENTICATED':
      return t('settings.backup_not_authenticated')
    case 'BACKUP_ID_CONFLICT':
      return t('settings.backup_id_conflict')
    default:
      if (code.includes('decrypt') || code.includes('operation')) {
        return t('settings.backup_wrong_passphrase')
      }
      return code
  }
}

export default function LogbookBackupPanel({ logbookId, onRestored }: LogbookBackupPanelProps) {
  const { t } = useTranslation()
  const { showConfirm } = useDialog()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportConfirm, setExportConfirm] = useState('')
  const [exporting, setExporting] = useState(false)

  const [importPassphrase, setImportPassphrase] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<LogbookBackupPreview | null>(null)
  const [parsedBackup, setParsedBackup] = useState<LogbookBackupFile | null>(null)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleExportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleExport()
  }

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleRestore()
  }

  const handleExport = async () => {
    setError(null)
    setSuccess(null)

    if (exportPassphrase.length < 8) {
      setError(t('settings.backup_passphrase_short'))
      return
    }
    if (exportPassphrase !== exportConfirm) {
      setError(t('settings.backup_passphrase_mismatch'))
      return
    }

    setExporting(true)
    try {
      const { blob, filename, backup } = await exportLogbookBackup(logbookId, exportPassphrase)
      downloadBackupBlob(blob, filename)
      setSuccess(t('settings.backup_export_success', { count: backup.counts.entries }))
      setExportPassphrase('')
      setExportConfirm('')
      trackPlausibleEvent(PlausibleEvents.BACKUP_EXPORTED, {
        entries: backup.counts.entries,
        photos: backup.counts.photos
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(mapBackupError(message, t))
    } finally {
      setExporting(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setSuccess(null)
    setImportPreview(null)
    setParsedBackup(null)
    const file = e.target.files?.[0]
    setImportFile(file ?? null)
    if (!file) return

    try {
      const backup = await parseLogbookBackupFile(file)
      setParsedBackup(backup)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(mapBackupError(message, t))
      setImportFile(null)
    }
  }

  const handlePreviewImport = async () => {
    if (!parsedBackup || !importPassphrase) return
    setPreviewing(true)
    setError(null)
    try {
      const preview = await previewLogbookBackup(parsedBackup, importPassphrase)
      setImportPreview(preview)
    } catch (err: unknown) {
      setImportPreview(null)
      setError(t('settings.backup_wrong_passphrase'))
    } finally {
      setPreviewing(false)
    }
  }

  const handleRestore = async (options: { overwrite?: boolean; assignNewId?: boolean } = {}) => {
    if (!parsedBackup || !importPassphrase) return

    setImporting(true)
    setError(null)
    try {
      const result = await restoreLogbookBackup(parsedBackup, importPassphrase, options)
      setSuccess(t('settings.backup_restore_success', { title: result.title }))
      setImportFile(null)
      setImportPassphrase('')
      setImportPreview(null)
      setParsedBackup(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      trackPlausibleEvent(PlausibleEvents.BACKUP_RESTORED, {
        entries: parsedBackup.counts.entries,
        photos: parsedBackup.counts.photos,
        mode: options.overwrite ? 'overwrite' : options.assignNewId ? 'new_id' : 'same_id'
      })
      onRestored?.(result.logbookId, result.title)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'BACKUP_ID_CONFLICT') {
        const overwrite = await showConfirm(
          t('settings.backup_overwrite_confirm'),
          t('settings.backup_restore_title'),
          t('logs.confirm_yes'),
          t('logs.confirm_no')
        )
        if (overwrite) {
          setImporting(false)
          return handleRestore({ overwrite: true })
        }
        const asNew = await showConfirm(
          t('settings.backup_new_id_confirm'),
          t('settings.backup_restore_title'),
          t('logs.confirm_yes'),
          t('logs.confirm_no')
        )
        if (asNew) {
          setImporting(false)
          return handleRestore({ assignNewId: true })
        }
        setError(t('settings.backup_restore_cancelled'))
      } else {
        setError(mapBackupError(message, t))
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="member-editor-card glass mt-6 backup-panel" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Archive size={20} style={{ color: '#38bdf8' }} />
        <h3 style={{ margin: 0, color: '#38bdf8', fontSize: '16px' }}>
          {t('settings.backup_title')}
        </h3>
      </div>

      <p className="text-muted" style={{ fontSize: '13.5px', lineHeight: '145%', margin: '0 0 20px 0' }}>
        {t('settings.backup_desc')}
      </p>

      {error && (
        <div className="auth-error mb-4" role="alert">
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          {error}
        </div>
      )}

      {success && (
        <div className="success-toast mb-4">
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      <section className="backup-section" aria-labelledby="backup-export-heading">
        <h4 id="backup-export-heading" className="backup-section-title">
          <Download size={16} aria-hidden="true" />
          {t('settings.backup_export_title')}
        </h4>
        <p className="text-muted backup-section-desc">{t('settings.backup_export_desc')}</p>

        <form onSubmit={handleExportSubmit} className="backup-export-form">
          <div className="input-group">
            <label htmlFor="backup-export-passphrase">{t('settings.backup_passphrase')}</label>
            <input
              id="backup-export-passphrase"
              name="backup-export-passphrase"
              type="password"
              className="input-text"
              value={exportPassphrase}
              onChange={(e) => setExportPassphrase(e.target.value)}
              placeholder={t('settings.backup_passphrase_placeholder')}
              autoComplete="new-password"
              disabled={exporting}
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="backup-export-confirm">{t('settings.backup_passphrase_confirm')}</label>
            <input
              id="backup-export-confirm"
              name="backup-export-confirm"
              type="password"
              className="input-text"
              value={exportConfirm}
              onChange={(e) => setExportConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={exporting}
              required
            />
          </div>
          <button
            type="submit"
            className="btn primary"
            disabled={exporting || !exportPassphrase || !exportConfirm}
          >
            <Download size={16} />
            {exporting ? t('settings.backup_exporting') : t('settings.backup_export_btn')}
          </button>
        </form>
      </section>

      <section className="backup-section backup-section--import" aria-labelledby="backup-import-heading">
        <h4 id="backup-import-heading" className="backup-section-title">
          <Upload size={16} aria-hidden="true" />
          {t('settings.backup_restore_title')}
        </h4>
        <p className="text-muted backup-section-desc">{t('settings.backup_restore_desc')}</p>

        <form onSubmit={handleImportSubmit} className="backup-import-form">
          <div className="input-group">
            <label htmlFor="backup-import-file">{t('settings.backup_file_label')}</label>
            <input
              id="backup-import-file"
              ref={fileInputRef}
              type="file"
              accept=".daagbok.json,application/json"
              className="input-text"
              onChange={handleFileChange}
              disabled={importing}
            />
          </div>

          {importFile && (
            <>
              <div className="input-group">
                <label htmlFor="backup-import-passphrase">{t('settings.backup_passphrase')}</label>
                <input
                  id="backup-import-passphrase"
                  name="backup-import-passphrase"
                  type="password"
                  className="input-text"
                  value={importPassphrase}
                  onChange={(e) => {
                    setImportPassphrase(e.target.value)
                    setImportPreview(null)
                  }}
                  autoComplete="current-password"
                  disabled={importing}
                  required
                />
              </div>

              <div className="backup-actions-row">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handlePreviewImport}
                  disabled={previewing || importing || !importPassphrase}
                >
                  {previewing ? t('settings.backup_previewing') : t('settings.backup_preview_btn')}
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={importing || !importPassphrase}
                >
                  <Upload size={16} />
                  {importing ? t('settings.backup_restoring') : t('settings.backup_restore_btn')}
                </button>
              </div>
            </>
          )}
        </form>

        {importPreview && (
          <div className="backup-preview glass">
            <p className="backup-preview-title">{importPreview.title}</p>
            <ul className="backup-preview-stats">
              <li>{t('settings.backup_stat_entries', { count: importPreview.counts.entries })}</li>
              <li>{t('settings.backup_stat_photos', { count: importPreview.counts.photos })}</li>
              <li>{t('settings.backup_stat_crew', { count: importPreview.counts.crews })}</li>
              <li>{t('settings.backup_stat_tracks', { count: importPreview.counts.gpsTracks })}</li>
            </ul>
            <p className="text-muted backup-preview-date">
              {t('settings.backup_exported_at', {
                date: new Date(importPreview.exportedAt).toLocaleString()
              })}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
