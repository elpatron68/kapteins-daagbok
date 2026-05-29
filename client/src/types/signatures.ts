/** Passkey-Freigabe — gespeichert im E2E-verschlüsselten Eintrag */
export interface PasskeySignature {
  kind: 'passkey'
  version: 1
  role: 'skipper' | 'crew'
  userId: string
  username: string
  credentialId: string
  signedAt: string
  entryHash: string
  clientVerified: boolean
}

/** Legacy: PNG data URL oder getippter Name */
export type SignatureValue = string | PasskeySignature
