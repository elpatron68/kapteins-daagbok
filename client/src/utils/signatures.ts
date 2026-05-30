import { hashEntryForSigning } from './entryCanonicalHash.js'
import type { ClassicSignature, PasskeySignature, SignatureValue } from '../types/signatures.js'

export type SkipperSignStatus = 'none' | 'valid' | 'invalid'

export interface SignatureAttribution {
  username: string
  signedAt: string
}

export function isSignatureImage(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith('data:image/')
}

export function isPasskeySignature(value: unknown): value is PasskeySignature {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PasskeySignature).kind === 'passkey' &&
    (value as PasskeySignature).version === 1
  )
}

export function isClassicSignature(value: unknown): value is ClassicSignature {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ClassicSignature).kind === 'classic' &&
    (value as ClassicSignature).version === 1
  )
}

export function getSignaturePayload(value: SignatureValue | '' | undefined | null): string {
  if (!value) return ''
  if (isClassicSignature(value)) return value.payload
  if (isPasskeySignature(value)) return ''
  return value
}

export function getSignatureAttribution(value: SignatureValue | '' | undefined | null): SignatureAttribution | null {
  if (!value || typeof value === 'string') return null
  if (isPasskeySignature(value) || isClassicSignature(value)) {
    return { username: value.username, signedAt: value.signedAt }
  }
  return null
}

export function createClassicSignature(input: {
  role: 'skipper' | 'crew'
  userId: string
  username: string
  signedAt: string
  payload: string
}): ClassicSignature {
  return {
    kind: 'classic',
    version: 1,
    role: input.role,
    userId: input.userId,
    username: input.username,
    signedAt: input.signedAt,
    payload: input.payload
  }
}

export function normalizeSignature(value: unknown): SignatureValue | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (isPasskeySignature(value)) return value
  if (isClassicSignature(value)) return value
  if (typeof value === 'string') return value
  return undefined
}

export function hasAnySignature(
  skipper: SignatureValue | '' | undefined,
  crew: SignatureValue | '' | undefined
): boolean {
  return !!(skipper || crew)
}

export function isSignatureValidForEntry(sig: PasskeySignature, entryHash: string): boolean {
  return sig.entryHash === entryHash
}

export async function getSkipperSignStatus(
  entry: Record<string, unknown>
): Promise<SkipperSignStatus> {
  const signSkipper = normalizeSignature(entry.signSkipper)
  if (!signSkipper) return 'none'
  if (!isPasskeySignature(signSkipper)) return 'valid'
  const hash = await hashEntryForSigning(entry)
  return isSignatureValidForEntry(signSkipper, hash) ? 'valid' : 'invalid'
}

export interface SignatureExportLabels {
  imagePlaceholder: string
  passkeyLabel: (username: string, signedAt: string) => string
  attributionLabel: (username: string, signedAt: string) => string
}

export function formatSignatureForExport(
  value: SignatureValue | undefined | null,
  labels: SignatureExportLabels
): string {
  if (!value) return ''
  if (isPasskeySignature(value)) {
    return labels.passkeyLabel(value.username, value.signedAt)
  }
  if (isClassicSignature(value)) {
    return labels.attributionLabel(value.username, value.signedAt)
  }
  if (isSignatureImage(value)) return labels.imagePlaceholder
  return value
}

export function serializeSignature(value: SignatureValue | '' | undefined): SignatureValue | undefined {
  if (!value) return undefined
  if (isPasskeySignature(value) || isClassicSignature(value)) return value
  const payload = typeof value === 'string' ? value : getSignaturePayload(value)
  if (isSignatureImage(payload)) return payload
  const trimmed = payload.trim()
  return trimmed || undefined
}

/** Normalize then serialize — canonical form for persistence and dirty-check fingerprints. */
export function normalizedSerializedSignature(value: unknown): SignatureValue | undefined {
  return serializeSignature(normalizeSignature(value) || '')
}

export function fingerprintSignature(value: unknown): SignatureValue | '' {
  return normalizedSerializedSignature(value) ?? ''
}
