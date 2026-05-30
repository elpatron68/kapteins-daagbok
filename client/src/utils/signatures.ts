import { hashEntryForSigning } from './entryCanonicalHash.js'
import type { PasskeySignature, SignatureValue } from '../types/signatures.js'

export type SkipperSignStatus = 'none' | 'valid' | 'invalid'

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

export function normalizeSignature(value: unknown): SignatureValue | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (isPasskeySignature(value)) return value
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
}

export function formatSignatureForExport(
  value: SignatureValue | undefined | null,
  labels: SignatureExportLabels
): string {
  if (!value) return ''
  if (isPasskeySignature(value)) {
    return labels.passkeyLabel(value.username, value.signedAt)
  }
  if (isSignatureImage(value)) return labels.imagePlaceholder
  return value
}

export function serializeSignature(value: SignatureValue | '' | undefined): SignatureValue | undefined {
  if (!value) return undefined
  if (isPasskeySignature(value)) return value
  if (isSignatureImage(value)) return value
  const trimmed = value.trim()
  return trimmed || undefined
}

/** Normalize then serialize — canonical form for persistence and dirty-check fingerprints. */
export function normalizedSerializedSignature(value: unknown): SignatureValue | undefined {
  return serializeSignature(normalizeSignature(value) || '')
}

export function fingerprintSignature(value: unknown): string {
  return normalizedSerializedSignature(value) ?? ''
}
