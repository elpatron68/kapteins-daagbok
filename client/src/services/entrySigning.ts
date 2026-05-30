import { startAuthentication } from '@simplewebauthn/browser'
import type { PasskeySignature } from '../types/signatures.js'
import { apiJson } from './api.js'

export async function signLogEntry(params: {
  logbookId: string
  entryId: string
  entryHash: string
  role: 'skipper' | 'crew'
}): Promise<PasskeySignature> {
  if (!localStorage.getItem('active_userid')) throw new Error('User not authenticated')

  const options = await apiJson<any>('/api/sign/options', {
    method: 'POST',
    body: JSON.stringify(params)
  })

  const credentialResponse = await startAuthentication({ optionsJSON: options })

  const result = await apiJson<{
    userId: string
    username: string
    credentialId: string
    signedAt: string
  }>('/api/sign/verify', {
    method: 'POST',
    body: JSON.stringify({
      credentialResponse,
      challenge: options.challenge,
      logbookId: params.logbookId,
      entryId: params.entryId,
      entryHash: params.entryHash,
      role: params.role
    })
  })

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
