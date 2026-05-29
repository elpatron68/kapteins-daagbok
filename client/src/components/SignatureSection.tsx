import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import SignaturePad from './SignaturePad.tsx'
import PasskeySignButton from './PasskeySignButton.tsx'
import type { PasskeySignature, SignatureValue } from '../types/signatures.js'
import { isPasskeySignature } from '../utils/signatures.js'

type SignatureMode = 'passkey' | 'classic'

interface SignatureSectionProps {
  readOnly?: boolean
  disabled?: boolean
  isOnline: boolean
  isOwner: boolean
  hasWriteCollaborators: boolean
  signSkipper: SignatureValue | ''
  signCrew: SignatureValue | ''
  skipperSignatureValid: boolean
  crewSignatureValid: boolean
  onSignSkipperChange: (value: SignatureValue | '') => void
  onSignCrewChange: (value: SignatureValue | '') => void
  onPasskeySignSkipper: () => Promise<void>
  onPasskeySignCrew: () => Promise<void>
  onBeforeSign?: () => Promise<boolean>
}

function padValue(value: SignatureValue | ''): string {
  if (!value || isPasskeySignature(value)) return ''
  return value
}

function modeFromValue(value: SignatureValue | '', passkeyAvailable: boolean): SignatureMode {
  if (isPasskeySignature(value)) return 'passkey'
  if (value) return 'classic'
  return passkeyAvailable ? 'passkey' : 'classic'
}

interface RoleSignatureBlockProps {
  roleLabel: string
  passkeyLabel: string
  padId: string
  value: SignatureValue | ''
  passkeySignature?: PasskeySignature
  signatureValid: boolean
  showPasskey: boolean
  readOnly: boolean
  disabled: boolean
  classicHint?: string
  offlineHint?: string
  onChange: (value: SignatureValue | '') => void
  onPasskeySign: () => Promise<void>
  onBeforeSign?: () => Promise<boolean>
}

function RoleSignatureBlock({
  roleLabel,
  passkeyLabel,
  padId,
  value,
  passkeySignature,
  signatureValid,
  showPasskey,
  readOnly,
  disabled,
  classicHint,
  offlineHint,
  onChange,
  onPasskeySign,
  onBeforeSign
}: RoleSignatureBlockProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<SignatureMode>(() => modeFromValue(value, showPasskey))

  useEffect(() => {
    setMode(modeFromValue(value, showPasskey))
  }, [value, showPasskey])

  const switchToClassic = () => {
    setMode('classic')
    if (isPasskeySignature(value)) onChange('')
  }

  const switchToPasskey = () => {
    setMode('passkey')
    if (value && !isPasskeySignature(value)) onChange('')
  }

  const handlePadChange = (next: string) => {
    setMode('classic')
    onChange(next)
  }

  if (readOnly) {
    if (isPasskeySignature(value)) {
      return (
        <div className="signature-role-block">
          <PasskeySignButton
            label={passkeyLabel}
            signature={value}
            signatureValid={signatureValid}
            disabled={disabled}
            canSign={false}
            onSign={onPasskeySign}
          />
        </div>
      )
    }
    return (
      <div className="signature-role-block">
        <SignaturePad
          id={padId}
          label={roleLabel}
          value={padValue(value)}
          onChange={() => {}}
          disabled={disabled}
          readOnly
        />
      </div>
    )
  }

  const showPasskeyPanel = showPasskey && mode === 'passkey'
  const showClassicPanel = !showPasskey || mode === 'classic'

  return (
    <div className="signature-role-block">
      {showPasskey && (
        <div className="signature-mode-toggle" role="tablist" aria-label={passkeyLabel}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'passkey'}
            className={`signature-mode-btn ${mode === 'passkey' ? 'active' : ''}`}
            onClick={switchToPasskey}
          >
            {t('logs.sign_mode_passkey')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'classic'}
            className={`signature-mode-btn ${mode === 'classic' ? 'active' : ''}`}
            onClick={switchToClassic}
          >
            {t('logs.sign_mode_classic')}
          </button>
        </div>
      )}

      {showPasskeyPanel && (
        <PasskeySignButton
          label={passkeyLabel}
          signature={passkeySignature}
          signatureValid={signatureValid}
          disabled={disabled}
          canSign
          onSign={onPasskeySign}
          onClear={passkeySignature ? switchToClassic : undefined}
        />
      )}

      {showClassicPanel && (
        <>
          <SignaturePad
            id={padId}
            label={roleLabel}
            value={padValue(value)}
            onChange={handlePadChange}
            disabled={disabled}
            readOnly={false}
            onBeforeSign={onBeforeSign}
          />
          {classicHint && !passkeySignature && (
            <p className="signature-hint">{classicHint}</p>
          )}
        </>
      )}

      {offlineHint && !showPasskey && (
        <p className="signature-hint">{offlineHint}</p>
      )}
    </div>
  )
}

export default function SignatureSection({
  readOnly = false,
  disabled = false,
  isOnline,
  isOwner,
  hasWriteCollaborators,
  signSkipper,
  signCrew,
  skipperSignatureValid,
  crewSignatureValid,
  onSignSkipperChange,
  onSignCrewChange,
  onPasskeySignSkipper,
  onPasskeySignCrew,
  onBeforeSign
}: SignatureSectionProps) {
  const { t } = useTranslation()

  const showSkipperPasskey = isOwner && isOnline
  const showCrewPasskey = hasWriteCollaborators && isOnline
  const hasSignature = !!(signSkipper || signCrew)

  return (
    <div className="form-card">
      <div className="form-header">
        <Check size={20} className="form-icon" />
        <h3>{t('logs.signatures')}</h3>
      </div>

      {!readOnly && (
        <p className={`signature-lock-notice ${hasSignature ? 'locked' : ''}`}>
          {hasSignature ? t('logs.sign_lock_active') : t('logs.sign_lock_notice')}
        </p>
      )}

      <div className="form-grid signature-grid">
        <RoleSignatureBlock
          roleLabel={t('logs.sign_skipper')}
          passkeyLabel={t('logs.sign_skipper')}
          padId="sign-skipper"
          value={signSkipper}
          passkeySignature={isPasskeySignature(signSkipper) ? signSkipper : undefined}
          signatureValid={skipperSignatureValid}
          showPasskey={showSkipperPasskey}
          readOnly={readOnly}
          disabled={disabled}
          classicHint={showSkipperPasskey ? t('logs.sign_classic_or_passkey') : undefined}
          offlineHint={!isOnline && isOwner ? t('logs.sign_offline_hint') : undefined}
          onChange={onSignSkipperChange}
          onPasskeySign={onPasskeySignSkipper}
          onBeforeSign={onBeforeSign}
        />

        <RoleSignatureBlock
          roleLabel={t('logs.sign_crew')}
          passkeyLabel={t('logs.sign_crew')}
          padId="sign-crew"
          value={signCrew}
          passkeySignature={isPasskeySignature(signCrew) ? signCrew : undefined}
          signatureValid={crewSignatureValid}
          showPasskey={showCrewPasskey}
          readOnly={readOnly}
          disabled={disabled}
          classicHint={showCrewPasskey ? t('logs.sign_crew_passkey_hint') : undefined}
          onChange={onSignCrewChange}
          onPasskeySign={onPasskeySignCrew}
          onBeforeSign={onBeforeSign}
        />
      </div>
    </div>
  )
}
