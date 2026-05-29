import { startAuthentication } from '@simplewebauthn/browser'
import type { PasskeySignature } from '../types/signatures.js'

export async function signLogEntry(params: {
  logbookId: string
  entryId: string
  entryHash: string
  role: 'skipper' | 'crew'
}): Promise<PasskeySignature> {
  const userId = localStorage.getItem('active_userid')
  if (!userId) throw new Error('User not authenticated')

  const optionsRes = await fetch('/api/sign/options', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify(params)
  })

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to start passkey signing')
  }

  const options = await optionsRes.json()
  const credentialResponse = await startAuthentication({ optionsJSON: options })

  const verifyRes = await fetch('/api/sign/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId
    },
    body: JSON.stringify({
      credentialResponse,
      challenge: options.challenge,
      logbookId: params.logbookId,
      entryId: params.entryId,
      entryHash: params.entryHash,
      role: params.role
    })
  })

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}))
    throw new Error(err.error || 'Passkey signature verification failed')
  }

  const result = await verifyRes.json()

  return {
    kind: 'passkey',
    version: 1,
    role: params.role,
    userId: result.userId,
    username: result.username,
    credentialId: result.credentialId,
    signedAt: result.signedAt,
    entryHash: params.entryHash,
    clientVerified: true
  }
}
