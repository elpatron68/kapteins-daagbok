import { describe, expect, it } from 'vitest'
import {
  isPasskeyCompatibleHostname,
  isPasskeyInvalidDomainError,
  isWebAuthnUserAbortError,
  localizeWebAuthnError,
  toPasskeyCompatibleUrl
} from './passkeyHost.js'

describe('isPasskeyCompatibleHostname', () => {
  it('accepts localhost and real domains', () => {
    expect(isPasskeyCompatibleHostname('localhost')).toBe(true)
    expect(isPasskeyCompatibleHostname('kapteins-daagbok.eu')).toBe(true)
  })

  it('rejects IP addresses', () => {
    expect(isPasskeyCompatibleHostname('127.0.0.1')).toBe(false)
  })
})

describe('toPasskeyCompatibleUrl', () => {
  it('rewrites 127.0.0.1 to localhost', () => {
    expect(toPasskeyCompatibleUrl('http://127.0.0.1:5173/demo?lng=de')).toBe(
      'http://localhost:5173/demo?lng=de'
    )
  })
})

describe('isPasskeyInvalidDomainError', () => {
  it('detects simplewebauthn browser message', () => {
    expect(isPasskeyInvalidDomainError('127.0.0.1 is an invalid domain')).toBe(true)
    expect(isPasskeyInvalidDomainError('User cancelled')).toBe(false)
  })
})

describe('isWebAuthnUserAbortError', () => {
  it('detects NotAllowedError and timeout messages', () => {
    expect(isWebAuthnUserAbortError({ name: 'NotAllowedError', message: 'timed out' })).toBe(true)
    expect(
      isWebAuthnUserAbortError(
        new Error('The operation either timed out or was not allowed.')
      )
    ).toBe(true)
    expect(isWebAuthnUserAbortError({ name: 'SecurityError', message: 'bad rp' })).toBe(false)
  })
})

describe('localizeWebAuthnError', () => {
  it('maps cancellation to a friendly message', () => {
    expect(
      localizeWebAuthnError('The operation either timed out or was not allowed.', {
        invalidHost: 'host',
        cancelled: 'cancelled'
      })
    ).toBe('cancelled')
  })
})
