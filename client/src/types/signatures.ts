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

/** Klassische Unterschrift mit Benutzer-Zuordnung (Crew) */
export interface ClassicSignature {
  kind: 'classic'
  version: 1
  role: 'skipper' | 'crew'
  userId: string
  username: string
  signedAt: string
  payload: string
}

/** Legacy: PNG data URL oder getippter Name; oder strukturierte Signaturen */
export type SignatureValue = string | PasskeySignature | ClassicSignature
