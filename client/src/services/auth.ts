import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import {
  generateMasterKey,
  deriveKeyFromPhrase,
  deriveKeyFromPrf,
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

// Restore key from sessionStorage on load if present (survives reload)
try {
  const savedKey = sessionStorage.getItem('active_master_key')
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
      sessionStorage.setItem('active_master_key', bufferToBase64(key))
    } catch (e) {
      console.error('Failed to save master key to sessionStorage:', e)
    }
  } else {
    sessionStorage.removeItem('active_master_key')
  }
}

// Convert string salt to 32-byte Uint8Array
const PRF_SALT = new TextEncoder().encode("KapteinsDaagboxPRFSaltForE2EKey")

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

  // Request the PRF extension in the browser options
  if (!options.extensions) {
    options.extensions = {}
  }
  options.extensions.prf = {
    eval: {
      first: PRF_SALT
    }
  }

  // 2. Start biometric Passkey creation
  const credentialResponse = await startRegistration(options)

  // 3. Cryptographic Key derivation setup
  const masterKey = generateMasterKey()

  // Try to derive PRF key if supported
  let encryptedMasterKeyPrf = null
  let encryptedMasterKeyPrfIv = null
  let encryptedMasterKeyPrfTag = null

  const prfResults = (credentialResponse as any).clientExtensionResults?.prf

  if (prfResults?.enabled && prfResults.results?.first) {
    const prfKey = await deriveKeyFromPrf(prfResults.results.first)
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
    prfFirst?: ArrayBuffer
  }
}

export async function loginUser(username?: string): Promise<LoginResult> {
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
      first: PRF_SALT
    }
  }

  // 2. Start biometric Passkey verification
  const credentialResponse = await startAuthentication(options)

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
  const prfResults = (credentialResponse as any).clientExtensionResults?.prf

  if (prfResults?.results?.first && result.encryptedMasterKeyPrf) {
    try {
      const prfKey = await deriveKeyFromPrf(prfResults.results.first)
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
    prfFirst?: ArrayBuffer
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
      try {
        const prfKey = await deriveKeyFromPrf(encryptedPayloads.prfFirst)
        const encryptedPrf = await encryptBuffer(decryptedMaster, prfKey)
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
        if (!enrollRes.ok) {
          console.warn('Server rejected PRF enrollment')
        }
      } catch (err) {
        console.error('Failed to encrypt/enroll master key with PRF key:', err)
      }
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
  if (!userId) return false

  try {
    const res = await fetch(`${API_BASE}/delete-account`, {
      method: 'DELETE',
      headers: {
        'X-User-Id': userId
      }
    })

    if (res.ok) {
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
