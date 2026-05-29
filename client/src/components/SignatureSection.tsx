import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import SignaturePad from './SignaturePad.tsx'
import PasskeySignButton from './PasskeySignButton.tsx'
import type { SignatureValue } from '../types/signatures.js'
import { isPasskeySignature } from '../utils/signatures.js'

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
}

function padValue(value: SignatureValue | ''): string {
  if (!value || isPasskeySignature(value)) return ''
  return value
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
  onPasskeySignCrew
}: SignatureSectionProps) {
  const { t } = useTranslation()

  const skipperPasskey = isPasskeySignature(signSkipper) ? signSkipper : undefined
  const crewPasskey = isPasskeySignature(signCrew) ? signCrew : undefined

  const showSkipperPasskey = isOwner && isOnline
  const showCrewPasskey = hasWriteCollaborators && isOnline

  return (
    <div className="form-card">
      <div className="form-header">
        <Check size={20} className="form-icon" />
        <h3>{t('logs.signatures')}</h3>
      </div>

      <div className="form-grid signature-grid">
        <div className="signature-role-block">
          {showSkipperPasskey && (
            <PasskeySignButton
              label={t('logs.sign_skipper')}
              signature={skipperPasskey}
              signatureValid={skipperSignatureValid}
              disabled={disabled}
              canSign={!readOnly}
              onSign={onPasskeySignSkipper}
              onClear={skipperPasskey ? () => onSignSkipperChange('') : undefined}
            />
          )}

          {!skipperPasskey && (
            <SignaturePad
              id="sign-skipper"
              label={t('logs.sign_skipper')}
              value={padValue(signSkipper)}
              onChange={onSignSkipperChange}
              disabled={disabled}
              readOnly={readOnly}
            />
          )}

          {showSkipperPasskey && !skipperPasskey && !readOnly && (
            <p className="signature-hint">{t('logs.sign_classic_or_passkey')}</p>
          )}

          {!isOnline && isOwner && !readOnly && (
            <p className="signature-hint">{t('logs.sign_offline_hint')}</p>
          )}
        </div>

        <div className="signature-role-block">
          {showCrewPasskey && (
            <PasskeySignButton
              label={t('logs.sign_crew')}
              signature={crewPasskey}
              signatureValid={crewSignatureValid}
              disabled={disabled}
              canSign={!readOnly}
              onSign={onPasskeySignCrew}
              onClear={crewPasskey ? () => onSignCrewChange('') : undefined}
            />
          )}

          {!crewPasskey && (
            <SignaturePad
              id="sign-crew"
              label={t('logs.sign_crew')}
              value={padValue(signCrew)}
              onChange={onSignCrewChange}
              disabled={disabled}
              readOnly={readOnly}
            />
          )}

          {showCrewPasskey && !crewPasskey && !readOnly && (
            <p className="signature-hint">{t('logs.sign_crew_passkey_hint')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
