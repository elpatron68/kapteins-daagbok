import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Download, Check, AlertTriangle } from 'lucide-react'
import {
  downloadBackupBlob,
  exportLogbookBackup
} from '../services/logbookBackup.js'
import { PlausibleEvents, trackPlausibleEvent } from '../services/analytics.js'

interface LogbookBackupPanelProps {
  logbookId: string
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

export default function LogbookBackupPanel({ logbookId }: LogbookBackupPanelProps) {
  const { t } = useTranslation()

  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportConfirm, setExportConfirm] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const exportPassphrasesMatch =
    exportPassphrase.length >= 8 && exportPassphrase === exportConfirm

  const handleExportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleExport()
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
    setExportProgress(null)
    try {
      const { blob, filename, manifest } = await exportLogbookBackup(logbookId, exportPassphrase, {
        onProgress: (p) => {
          if (p.phase === 'pack') {
            setExportProgress(
              t('settings.backup_export_progress', {
                current: p.current,
                total: p.total
              })
            )
          }
        }
      })
      downloadBackupBlob(blob, filename)
      setSuccess(t('settings.backup_export_success', { count: manifest.counts.entries }))
      setExportPassphrase('')
      setExportConfirm('')
      trackPlausibleEvent(PlausibleEvents.BACKUP_EXPORTED, {
        entries: manifest.counts.entries,
        photos: manifest.counts.photos,
        voiceMemos: manifest.counts.voiceMemos,
        bytes: manifest.totalUncompressedBytes
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(mapBackupError(message, t))
    } finally {
      setExporting(false)
      setExportProgress(null)
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
            disabled={exporting || !exportPassphrasesMatch}
          >
            <Download size={16} />
            {exporting ? t('settings.backup_exporting') : t('settings.backup_export_btn')}
          </button>
          {exportProgress && (
            <p className="text-muted backup-export-progress" role="status">
              {exportProgress}
            </p>
          )}
        </form>
      </section>
    </div>
  )
}
