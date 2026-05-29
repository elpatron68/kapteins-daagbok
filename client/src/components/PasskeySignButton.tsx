import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Fingerprint, Loader2, AlertTriangle } from 'lucide-react'
import type { PasskeySignature } from '../types/signatures.js'

interface PasskeySignButtonProps {
  label: string
  signature?: PasskeySignature
  signatureValid?: boolean
  disabled?: boolean
  canSign: boolean
  onSign: () => Promise<void>
  onClear?: () => void
}

export default function PasskeySignButton({
  label,
  signature,
  signatureValid = true,
  disabled = false,
  canSign,
  onSign,
  onClear
}: PasskeySignButtonProps) {
  const { t, i18n } = useTranslation()
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSign = async () => {
    setSigning(true)
    setError(null)
    try {
      await onSign()
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setError(t('logs.sign_passkey_cancelled'))
      } else {
        setError(err?.message || t('logs.sign_passkey_failed'))
      }
    } finally {
      setSigning(false)
    }
  }

  const formattedDate = signature
    ? new Date(signature.signedAt).toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-GB')
    : ''

  return (
    <div className="passkey-sign-block">
      <div className="passkey-sign-label">{label}</div>

      {signature ? (
        <div className={`passkey-sign-badge ${signatureValid ? 'valid' : 'invalid'}`}>
          <Fingerprint size={16} />
          <div className="passkey-sign-badge-text">
            <span>{t('logs.sign_passkey_signed', { username: signature.username })}</span>
            <span className="passkey-sign-date">{formattedDate}</span>
          </div>
          {!signatureValid && (
            <span className="passkey-sign-invalid-hint">
              <AlertTriangle size={14} />
              {t('logs.sign_invalid')}
            </span>
          )}
        </div>
      ) : null}

      {canSign && !disabled && (
        <button
          type="button"
          className="btn secondary passkey-sign-btn"
          onClick={handleSign}
          disabled={signing}
        >
          {signing ? <Loader2 size={16} className="spin" /> : <Fingerprint size={16} />}
          {signing ? t('logs.sign_passkey_signing') : t('logs.sign_with_passkey')}
        </button>
      )}

      {signature && onClear && !disabled && (
        <button type="button" className="btn text-btn passkey-sign-clear" onClick={onClear}>
          {t('logs.sign_passkey_clear')}
        </button>
      )}

      {error && <p className="passkey-sign-error">{error}</p>}
    </div>
  )
}
