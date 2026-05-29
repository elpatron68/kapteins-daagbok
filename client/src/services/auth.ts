import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import {
  generateMasterKey,
  deriveKeyFromPhrase,
  deriveKeyFromPrf,
  deriveKeyFromPin,
  encryptBuffer,
  decryptBuffer,
  generateRecoveryPhrase,
  base64ToBuffer,
  bufferToBase64
} from './crypto.js'
import { clearLogbookKeysCache } from './logbookKeys.js'
import { db } from './db.js'

const API_BASE = '/api/auth'

// Shared in-memory container for the active user's session master key
let activeMasterKey: ArrayBuffer | null = null

// Restore key from localStorage on load if present (survives reload/restart)
try {
  const savedKey = localStorage.getItem('active_master_key')
  if (savedKey) {
    activeMasterKey = base64ToBuffer(savedKey)
  }
} catch (e) {
  console.error('Failed to restore active master key:', e)
}

export function getActiveMasterKey(): ArrayBuffer | null {
  return activeMasterKey
}

export function setActiveMasterKey(key: ArrayBuffer | null) {
  activeMasterKey = key
  if (key) {
    try {
      localStorage.setItem('active_master_key', bufferToBase64(key))
    } catch (e) {
      console.error('Failed to save master key to localStorage:', e)
    }
  } else {
    localStorage.removeItem('active_master_key')
  }
}

// PIN fallback mechanism functions
export async function setLocalPin(pin: string, username: string, masterKey: ArrayBuffer): Promise<void> {
  const pinKey = await deriveKeyFromPin(pin, username)
  const encrypted = await encryptBuffer(masterKey, pinKey)
  localStorage.setItem(`pin_encrypted_master_key_${username.toLowerCase()}`, JSON.stringify(encrypted))
}

export function hasLocalPin(username: string): boolean {
  return !!localStorage.getItem(`pin_encrypted_master_key_${username.toLowerCase()}`)
}

export function removeLocalPin(username: string): void {
  localStorage.removeItem(`pin_encrypted_master_key_${username.toLowerCase()}`)
}

export async function decryptWithLocalPin(pin: string, username: string): Promise<ArrayBuffer | null> {
  const stored = localStorage.getItem(`pin_encrypted_master_key_${username.toLowerCase()}`)
  if (!stored) return null

  const { ciphertext, iv, tag } = JSON.parse(stored)
  const pinKey = await deriveKeyFromPin(pin, username)
  const decrypted = await decryptBuffer(ciphertext, iv, tag, pinKey)
  
  setActiveMasterKey(decrypted)
  localStorage.setItem('active_username', username)
  return decrypted
}

// Convert string salt to 32-byte Uint8Array
const PRF_SALT = new TextEncoder().encode("KapteinsDaagboxPRFSaltForE2EKey_")

function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function randomChallengeBase64url(): string {
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function extractPrfFirst(clientExtensionResults: any): ArrayBuffer | null {
  const first = clientExtensionResults?.prf?.results?.first
  if (!first) return null
  return typeof first === 'string' ? base64urlToBuffer(first) : first
}

// Some authenticators (notably on Chrome/Android and other platforms) only
// expose the PRF output during an assertion (`navigator.credentials.get`),
// not during credential creation. When that happens we perform a follow-up
// authentication against the freshly created credential purely to obtain the
// PRF output. The assertion itself is not sent to the server.
async function evaluatePrfViaAuthentication(
  credentialId: string,
  transports?: string[]
): Promise<ArrayBuffer | null> {
  try {
    const authOptions: any = {
      challenge: randomChallengeBase64url(),
      allowCredentials: [
        {
          id: credentialId,
          type: 'public-key',
          ...(transports && transports.length ? { transports } : {})
        }
      ],
      userVerification: 'preferred',
      extensions: { prf: { eval: { first: PRF_SALT.buffer } } }
    }
    const authResponse = await startAuthentication({ optionsJSON: authOptions })
    return extractPrfFirst(authResponse.clientExtensionResults)
  } catch (e) {
    console.warn('PRF follow-up authentication during registration failed:', e)
    return null
  }
}

export interface RegistrationResult {
  verified: boolean
  recoveryPhrase: string
}

export async function registerUser(username: string): Promise<RegistrationResult> {
  // 1. Get registration options
  const optionsRes = await fetch(`${API_BASE}/register-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  })

  if (!optionsRes.ok) {
    const err = await optionsRes.json()
    throw new Error(err.error || 'Failed to fetch registration options')
  }

  const options = await optionsRes.json()

  // Request the PRF extension WITH an evaluation salt. This must match the
  // salt used during login (PRF_SALT), otherwise the PRF-derived key produced
  // at login would never match what was stored here and every login would fall
  // back to the recovery phrase.
  if (!options.extensions) {
    options.extensions = {}
  }
  options.extensions.prf = { eval: { first: PRF_SALT.buffer } }

  // 2. Start biometric Passkey creation
  let credentialResponse
  const prfRequested = !!options.extensions?.prf
  try {
    credentialResponse = await startRegistration({ optionsJSON: options })
  } catch (err: any) {
    const isOptionError = err.name === 'NotSupportedError' || 
                          err.message?.toLowerCase().includes('options') || 
                          err.message?.toLowerCase().includes('process') ||
                          err.message?.toLowerCase().includes('unable to')
    if (prfRequested && isOptionError) {
      console.warn('Registration with PRF extension failed, retrying without PRF:', err)
      if (options.extensions) {
        delete options.extensions.prf
      }
      credentialResponse = await startRegistration({ optionsJSON: options })
    } else {
      throw err
    }
  }

  // 3. Cryptographic Key derivation setup
  const masterKey = generateMasterKey()

  // Try to derive PRF key if supported
  let encryptedMasterKeyPrf = null
  let encryptedMasterKeyPrfIv = null
  let encryptedMasterKeyPrfTag = null

  const clientExtensionResults = credentialResponse.clientExtensionResults || {}
  const prfResults = (clientExtensionResults as any).prf
  console.log('Registration PRF extension result:', prfResults)

  // Obtain the PRF output. Prefer the value returned by create(); if the
  // authenticator advertised PRF support but did not return a result, fall
  // back to a follow-up assertion to retrieve it.
  let prfFirstBuffer: ArrayBuffer | null = extractPrfFirst(clientExtensionResults)
  if (!prfFirstBuffer && prfResults?.enabled) {
    console.log('PRF enabled but no result from create(); performing follow-up assertion')
    prfFirstBuffer = await evaluatePrfViaAuthentication(
      credentialResponse.id,
      credentialResponse.response.transports
    )
  }

  if (prfFirstBuffer) {
    const prfKey = await deriveKeyFromPrf(prfFirstBuffer)
    const encryptedPrf = await encryptBuffer(masterKey, prfKey)
    encryptedMasterKeyPrf = encryptedPrf.ciphertext
    encryptedMasterKeyPrfIv = encryptedPrf.iv
    encryptedMasterKeyPrfTag = encryptedPrf.tag
  }

  // Always generate a fallback 12-word recovery phrase
  const recoveryPhrase = generateRecoveryPhrase()
  const recoveryKey = await deriveKeyFromPhrase(recoveryPhrase)
  const encryptedRecovery = await encryptBuffer(masterKey, recoveryKey)

  // 4. Verify registration on the server
  const verifyRes = await fetch(`${API_BASE}/register-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      credentialResponse,
      encryptedMasterKeyPrf,
      encryptedMasterKeyPrfIv,
      encryptedMasterKeyPrfTag,
      encryptedMasterKeyRec: encryptedRecovery.ciphertext,
      encryptedMasterKeyRecIv: encryptedRecovery.iv,
      encryptedMasterKeyRecTag: encryptedRecovery.tag
    })
  })

  if (!verifyRes.ok) {
    const err = await verifyRes.json()
    throw new Error(err.error || 'Failed to verify registration response')
  }

  const result = await verifyRes.json()
  if (result.verified) {
    setActiveMasterKey(masterKey)
    localStorage.setItem('active_username', username)
    localStorage.setItem('active_userid', result.userId)
  }

  return {
    verified: result.verified,
    recoveryPhrase
  }
}

export interface LoginResult {
  verified: boolean
  prfSuccess: boolean
  username?: string
  encryptedPayloads?: {
    encryptedMasterKeyRec: string
    encryptedMasterKeyRecIv: string
    encryptedMasterKeyRecTag: string
    userId: string
    username: string
    prfFirst?: string | ArrayBuffer
  }
}

export async function loginUser(username?: string): Promise<LoginResult> {
  // Log browser WebAuthn capabilities to diagnose PRF availability
  if (window.PublicKeyCredential && (window.PublicKeyCredential as any).getClientCapabilities) {
    (window.PublicKeyCredential as any).getClientCapabilities().then((caps: any) => {
      console.log('Browser WebAuthn client capabilities:', caps)
    }).catch((err: any) => {
      console.warn('Error reading WebAuthn client capabilities:', err)
    })
  } else {
    console.log('window.PublicKeyCredential.getClientCapabilities is not supported.')
  }

  // 1. Get authentication options
  const optionsRes = await fetch(`${API_BASE}/login-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  })

  if (!optionsRes.ok) {
    const err = await optionsRes.json()
    throw new Error(err.error || 'Failed to fetch login options')
  }

  const options = await optionsRes.json()

  // Add PRF extension evaluation input
  if (!options.extensions) {
    options.extensions = {}
  }
  options.extensions.prf = {
    eval: {
      first: PRF_SALT.buffer
    }
  }

  // 2. Start biometric Passkey verification
  let credentialResponse
  const prfRequested = !!options.extensions?.prf
  try {
    credentialResponse = await startAuthentication({ optionsJSON: options })
  } catch (err: any) {
    const isOptionError = err.name === 'NotSupportedError' || 
                          err.message?.toLowerCase().includes('options') || 
                          err.message?.toLowerCase().includes('process') ||
                          err.message?.toLowerCase().includes('unable to')
    if (prfRequested && isOptionError) {
      console.warn('Authentication with PRF extension failed, retrying without PRF:', err)
      if (options.extensions) {
        delete options.extensions.prf
      }
      credentialResponse = await startAuthentication({ optionsJSON: options })
    } else {
      throw err
    }
  }

  // 3. Verify assertion on the server
  const verifyRes = await fetch(`${API_BASE}/login-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentialResponse,
      challenge: options.challenge
    })
  })

  if (!verifyRes.ok) {
    const err = await verifyRes.json()
    throw new Error(err.error || 'Failed to verify login response')
  }

  const result = await verifyRes.json()
  if (!result.verified) {
    return { verified: false, prfSuccess: false }
  }

  const resolvedUsername = result.username

  // Try to decrypt master key using biometric PRF results
  const clientExtensionResults = credentialResponse.clientExtensionResults || {}
  console.log('WebAuthn client extension keys:', Object.keys(clientExtensionResults))
  const prfResults = (clientExtensionResults as any).prf
  console.log('PRF extension result present:', !!prfResults)
  if (prfResults) {
    console.log('PRF extension enabled:', prfResults.enabled)
    console.log('PRF extension results first present:', !!prfResults.results?.first)
  }

  if (prfResults?.results?.first && result.encryptedMasterKeyPrf) {
    try {
      const firstBuffer = typeof prfResults.results.first === 'string'
        ? base64urlToBuffer(prfResults.results.first)
        : prfResults.results.first
      const prfKey = await deriveKeyFromPrf(firstBuffer)
      const decryptedMaster = await decryptBuffer(
        result.encryptedMasterKeyPrf,
        result.encryptedMasterKeyPrfIv,
        result.encryptedMasterKeyPrfTag,
        prfKey
      )
      setActiveMasterKey(decryptedMaster)
      localStorage.setItem('active_username', resolvedUsername)
      localStorage.setItem('active_userid', result.userId)
      return { verified: true, prfSuccess: true, username: resolvedUsername }
    } catch (e) {
      console.warn('PRF decryption failed, falling back to recovery phrase:', e)
    }
  }

  // Return payloads to let the UI ask for the 12-word phrase
  return {
    verified: true,
    prfSuccess: false,
    username: resolvedUsername,
    encryptedPayloads: {
      encryptedMasterKeyRec: result.encryptedMasterKeyRec,
      encryptedMasterKeyRecIv: result.encryptedMasterKeyRecIv,
      encryptedMasterKeyRecTag: result.encryptedMasterKeyRecTag,
      userId: result.userId,
      username: resolvedUsername,
      prfFirst: prfResults?.results?.first
    }
  }
}

// Complete login if PRF failed or wasn't supported
export async function completeLoginWithRecovery(
  username: string,
  phrase: string,
  encryptedPayloads: {
    encryptedMasterKeyRec: string
    encryptedMasterKeyRecIv: string
    encryptedMasterKeyRecTag: string
    userId: string
    prfFirst?: string | ArrayBuffer
  }
): Promise<boolean> {
  try {
    const recoveryKey = await deriveKeyFromPhrase(phrase)
    const decryptedMaster = await decryptBuffer(
      encryptedPayloads.encryptedMasterKeyRec,
      encryptedPayloads.encryptedMasterKeyRecIv,
      encryptedPayloads.encryptedMasterKeyRecTag,
      recoveryKey
    )

    // If PRF results are available from the login challenge, enroll them now
    if (encryptedPayloads.prfFirst) {
      console.log('Attempting PRF enrollment on recovery login...')
      try {
        const firstBuffer = typeof encryptedPayloads.prfFirst === 'string'
          ? base64urlToBuffer(encryptedPayloads.prfFirst)
          : encryptedPayloads.prfFirst
        const prfKey = await deriveKeyFromPrf(firstBuffer)
        const encryptedPrf = await encryptBuffer(decryptedMaster, prfKey)
        console.log('Sending PRF credentials to server...')
        const enrollRes = await fetch(`${API_BASE}/enroll-prf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': encryptedPayloads.userId
          },
          body: JSON.stringify({
            encryptedMasterKeyPrf: encryptedPrf.ciphertext,
            encryptedMasterKeyPrfIv: encryptedPrf.iv,
            encryptedMasterKeyPrfTag: encryptedPrf.tag
          })
        })
        console.log('Enrollment response status:', enrollRes.status)
        if (!enrollRes.ok) {
          console.warn('Server rejected PRF enrollment')
        }
      } catch (err) {
        console.error('Failed to encrypt/enroll master key with PRF key:', err)
      }
    } else {
      console.log('No prfFirst present in encryptedPayloads, skipping enrollment.')
    }

    setActiveMasterKey(decryptedMaster)
    localStorage.setItem('active_username', username)
    localStorage.setItem('active_userid', encryptedPayloads.userId)
    return true
  } catch (error) {
    console.error('Failed to decrypt master key with recovery phrase:', error)
    return false
  }
}

export function logoutUser() {
  setActiveMasterKey(null)
  clearLogbookKeysCache()
  localStorage.removeItem('active_username')
  localStorage.removeItem('active_userid')
}

export async function deleteAccount(): Promise<boolean> {
  const userId = localStorage.getItem('active_userid')
  const username = localStorage.getItem('active_username')
  if (!userId) return false

  try {
    const res = await fetch(`${API_BASE}/delete-account`, {
      method: 'DELETE',
      headers: {
        'X-User-Id': userId
      }
    })

    if (res.ok) {
      if (username) {
        removeLocalPin(username)
      }
      // Clear IndexedDB completely to prevent leaking residual encrypted E2E data on client
      await Promise.all([
        db.logbooks.clear(),
        db.yachts.clear(),
        db.crews.clear(),
        db.deviations.clear(),
        db.entries.clear(),
        db.photos.clear(),
        db.gpsTracks.clear(),
        db.syncQueue.clear(),
        db.logbookKeys.clear()
      ])

      // Wipe localStorage and session variables
      logoutUser()
      return true
    }
  } catch (err) {
    console.error('Failed to delete account:', err)
  }
  return false
}
