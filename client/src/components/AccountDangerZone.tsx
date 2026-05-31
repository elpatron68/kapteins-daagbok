import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, AlertTriangle } from 'lucide-react'
import { useDialog } from './ModalDialog.tsx'
import { deleteAccount } from '../services/auth.js'

interface AccountDangerZoneProps {
  className?: string
}

export default function AccountDangerZone({ className = '' }: AccountDangerZoneProps) {
  const { t } = useTranslation()
  const { showConfirm, showAlert } = useDialog()
  const [deleting, setDeleting] = useState(false)

  const handleDeleteAccount = async () => {
    const confirmed = await showConfirm(
      t('settings.delete_account_confirm_desc'),
      t('settings.delete_account_confirm_title'),
      t('settings.delete_account_confirm_yes'),
      t('settings.delete_account_confirm_no')
    )

    if (!confirmed) return

    setDeleting(true)
    try {
      const success = await deleteAccount()
      if (success) {
        window.location.reload()
      } else {
        showAlert(t('settings.delete_account_failed'))
      }
    } catch (err: any) {
      showAlert(err.message || t('settings.delete_account_failed'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`account-danger-zone member-editor-card glass ${className}`.trim()}>
      <div className="account-danger-zone__header">
        <AlertTriangle size={20} className="account-danger-zone__icon" />
        <h3 className="account-danger-zone__title">{t('settings.danger_zone_title')}</h3>
      </div>

      <p className="account-danger-zone__desc">{t('settings.danger_zone_desc')}</p>
      <p className="account-danger-zone__hint">{t('settings.delete_backup_hint')}</p>

      <div className="form-actions account-danger-zone__actions">
        <button
          type="button"
          className="btn danger"
          onClick={handleDeleteAccount}
          disabled={deleting}
        >
          <Trash2 size={16} />
          {deleting ? t('settings.deleting_account') : t('settings.delete_account_btn')}
        </button>
      </div>
    </div>
  )
}
