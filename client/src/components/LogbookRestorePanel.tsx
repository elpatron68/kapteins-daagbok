import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Check, AlertTriangle } from 'lucide-react'
import { useDialog } from './ModalDialog.tsx'
import {
  parseLogbookBackupFile,
  previewLogbookBackup,
  restoreLogbookBackup,
  formatBackupBytes,
  BACKUP_SIZE_CONFIRM_BYTES,
  type ParsedLogbookBackup,
  type LogbookBackupPreview
} from '../services/logbookBackup.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'
import { formatAppDateTime } from '../utils/dateTimeFormat.js'

interface LogbookRestorePanelProps {
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
    case 'BACKUP_INVALID_ARCHIVE':
      return t('settings.backup_invalid_archive')
    case 'BACKUP_VERSION_UNSUPPORTED':
      return t('settings.backup_version_unsupported')
    case 'BACKUP_WRONG_PASSPHRASE':
      return t('settings.backup_wrong_passphrase')
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

export default function LogbookRestorePanel({ onRestored }: LogbookRestorePanelProps) {
  const { t, i18n } = useTranslation()
  const { showConfirm } = useDialog()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [importPassphrase, setImportPassphrase] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<LogbookBackupPreview | null>(null)
  const [parsedBackup, setParsedBackup] = useState<ParsedLogbookBackup | null>(null)
  const [importing, setImporting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleRestore()
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

    if (parsedBackup.manifest.totalUncompressedBytes > BACKUP_SIZE_CONFIRM_BYTES) {
      const ok = await showConfirm(
        t('settings.backup_import_size_confirm', {
          size: formatBackupBytes(parsedBackup.manifest.totalUncompressedBytes)
        }),
        t('settings.backup_restore_title'),
        t('logs.confirm_yes'),
        t('logs.confirm_no')
      )
      if (!ok) return
    }

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
        entries: parsedBackup.manifest.counts.entries,
        photos: parsedBackup.manifest.counts.photos,
        voiceMemos: parsedBackup.manifest.counts.voiceMemos,
        bytes: parsedBackup.manifest.totalUncompressedBytes,
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
    <div className="backup-section backup-section--import" aria-labelledby="backup-import-heading" style={{ marginTop: '8px' }}>
      <p className="text-muted backup-section-desc" style={{ fontSize: '13px', margin: '0 0 16px 0', textAlign: 'left', lineHeight: '1.4' }}>
        {t('settings.backup_restore_desc')}
      </p>

      {error && (
        <div className="auth-error mb-4" role="alert" style={{ textAlign: 'left' }}>
          <AlertTriangle size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          {error}
        </div>
      )}

      {success && (
        <div className="success-toast mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleImportSubmit} className="backup-import-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label htmlFor="backup-import-file" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--app-text-muted)', textAlign: 'left' }}>
            {t('settings.backup_file_label')}
          </label>
          <input
            id="backup-import-file"
            ref={fileInputRef}
            type="file"
            accept=".daagbok,application/zip"
            className="input-text"
            onChange={handleFileChange}
            disabled={importing}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {importFile && (
          <>
            <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="backup-import-passphrase" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--app-text-muted)', textAlign: 'left' }}>
                {t('settings.backup_passphrase')}
              </label>
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
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div className="backup-actions-row" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={handlePreviewImport}
                disabled={previewing || importing || !importPassphrase}
                style={{ flex: 1, padding: '10px' }}
              >
                {previewing ? t('settings.backup_previewing') : t('settings.backup_preview_btn')}
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={importing || !importPassphrase}
                style={{ flex: 1, padding: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Upload size={16} />
                {importing ? t('settings.backup_restoring') : t('settings.backup_restore_btn')}
              </button>
            </div>
          </>
        )}
      </form>

      {importPreview && (
        <div className="backup-preview glass" style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', border: '1px solid var(--app-border-subtle)', background: 'var(--app-surface-inset, rgba(0, 0, 0, 0.2))', textAlign: 'left' }}>
          <p className="backup-preview-title" style={{ fontWeight: 600, margin: '0 0 10px 0', fontSize: '14px', color: 'var(--app-text-heading)' }}>{importPreview.title}</p>
          <ul className="backup-preview-stats" style={{ listStyle: 'none', padding: 0, margin: '0 0 10px 0', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--app-text)' }}>
            <li>{t('settings.backup_stat_entries', { count: importPreview.counts.entries })}</li>
            <li>{t('settings.backup_stat_photos', { count: importPreview.counts.photos })}</li>
            <li>{t('settings.backup_stat_voice', { count: importPreview.counts.voiceMemos })}</li>
            <li>{t('settings.backup_stat_crew', { count: importPreview.counts.crews })}</li>
            <li>{t('settings.backup_stat_tracks', { count: importPreview.counts.gpsTracks })}</li>
            <li style={{ color: 'var(--app-text-muted)' }}>
              {t('settings.backup_stat_size', {
                size: formatBackupBytes(importPreview.totalUncompressedBytes)
              })}
            </li>
          </ul>
          <p className="text-muted backup-preview-date" style={{ fontSize: '11px', margin: 0, color: 'var(--app-text-muted)' }}>
            {t('settings.backup_exported_at', {
              date: formatAppDateTime(importPreview.exportedAt, i18n.language)
            })}
          </p>
        </div>
      )}
    </div>
  )
}
