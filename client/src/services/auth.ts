import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import {
  generateMasterKey,
  deriveKeyFromPhrase,
  deriveKeyFromPrf,
  deriveKeyFromPin,
  encryptBuffer,
  decryptBuffer,
  generateRecoveryPhrase
} from './crypto.js'
import { clearLogbookKeysCache } from './logbookKeys.js'
import { PlausibleEvents, trackPlausibleEvent } from './analytics.js'
import { db } from './db.js'
import { apiFetch, apiJson } from './api.js'
import { isWebAuthnUserAbortError } from '../utils/passkeyHost.js'

const API_BASE = '/api/auth'

// Master key lives in memory only (never localStorage — XSS-resistant).
let activeMasterKey: ArrayBuffer | null = null

try {
  localStorage.removeItem('active_master_key')
} catch {
  /* ignore */
}

export function getActiveMasterKey(): ArrayBuffer | null {
  return activeMasterKey
}

export function setActiveMasterKey(key: ArrayBuffer | null) {
  activeMasterKey = key
}

export async function checkServerSession(): Promise<{ authenticated: boolean; userId?: string }> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 8_000)
  try {
    return await apiJson<{ authenticated: boolean; userId?: string }>(`${API_BASE}/session`, {
      signal: controller.signal
    })
  } catch {
    return { authenticated: false }
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/** Master key + username in memory/storage — enough to stay in the unlocked UI. */
export function hasUnlockedLocalCrypto(): boolean {
  return !!(getActiveMasterKey() && localStorage.getItem('active_username'))
}

/** Crypto unlock plus user id for authenticated API calls (userId may already be in localStorage). */
export function hasUnlockedLocalSession(): boolean {
  return hasUnlockedLocalCrypto() && !!localStorage.getItem('active_userid')
}

/** Persist server session user id when the /session response includes it. */
export function persistSessionUserId(userId: string | undefined): void {
  if (userId) {
    localStorage.setItem('active_userid', userId)
  }
}

export async function reauthWithPasskey(): Promise<boolean> {
  const options = await apiJson<any>(`${API_BASE}/reauth-options`, {
    method: 'POST'
  })

  const credentialResponse = await startAuthentication({ optionsJSON: options })

  await apiJson(`${API_BASE}/reauth-verify`, {
    method: 'POST',
    body: JSON.stringify({
      credentialResponse,
      challenge: options.challenge
    })
  })

  return true
}

// PIN fallback mechanism functions
export async function setLocalPin(pin: string, username: string, masterKey: ArrayBuffer): Promise<void> {
  const pinKey = await deriveKeyFromPin(pin, username)
  const encrypted = await encryptBuffer(masterKey, pinKey)
  // Persist the userId alongside the PIN blob so a PIN-only unlock can restore
  // the full session identity (needed for all authenticated API calls).
  const userId = localStorage.getItem('active_userid') || ''
  localStorage.setItem(
    `pin_encrypted_master_key_${username.toLowerCase()}`,
    JSON.stringify({ ...encrypted, userId })
  )
}

export function hasLocalPin(username: string): boolean {
  return !!localStorage.getItem(`pin_encrypted_master_key_${username.toLowerCase()}`)
}

// Remembered accounts on this device.
// A login WITH a username (concrete allowCredentials) works across every tested
// platform authenticator (Google Password Manager, Bitwarden, Windows Hello),
// whereas a usernameless/discoverable assertion fails on some of them. By
// remembering the usernames that have authenticated on this device we can offer
// a one-click login without ever asking the user to type their name again.
const KNOWN_USERS_KEY = 'daagbox_known_users'

export function getKnownUsernames(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u.length > 0) : []
  } catch {
    return []
  }
}

export function rememberUsername(username: string): void {
  if (!username) return
  const list = getKnownUsernames()
  if (list.some((u) => u.toLowerCase() === username.toLowerCase())) return
  list.push(username)
  try {
    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(list))
  } catch (e) {
    console.error('Failed to persist known username:', e)
  }
}

export function forgetUsername(username: string): void {
  const list = getKnownUsernames().filter((u) => u.toLowerCase() !== username.toLowerCase())
  try {
    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(list))
  } catch (e) {
    console.error('Failed to update known usernames:', e)
  }
}

export function removeLocalPin(username: string): void {
  localStorage.removeItem(`pin_encrypted_master_key_${username.toLowerCase()}`)
}

export async function decryptWithLocalPin(pin: string, username: string): Promise<ArrayBuffer | null> {
  const stored = localStorage.getItem(`pin_encrypted_master_key_${username.toLowerCase()}`)
  if (!stored) return null

  const { ciphertext, iv, tag, userId } = JSON.parse(stored)
  const pinKey = await deriveKeyFromPin(pin, username)
  const decrypted = await decryptBuffer(ciphertext, iv, tag, pinKey)

  setActiveMasterKey(decrypted)
  localStorage.setItem('active_username', username)
  if (userId) {
    localStorage.setItem('active_userid', userId)
  }
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

function extractPrfFirst(clientExtensionResults: any): ArrayBuffer | null {
  const first = clientExtensionResults?.prf?.results?.first
  if (!first) return null
  return typeof first === 'string' ? base64urlToBuffer(first) : first
}

export interface RegistrationResult {
  verified: boolean
  recoveryPhrase: string
}

export async function registerUser(username: string): Promise<RegistrationResult> {
  // 1. Get registration options
  const options = await apiJson<any>(`${API_BASE}/register-options`, {
    method: 'POST',
    body: JSON.stringify({ username })
  })

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

  // Capture the PRF output if the authenticator already returned it during
  // create(). We intentionally do NOT trigger a second assertion here: that
  // produces a confusing second OS prompt during sign-up and fails on some
  // platforms (e.g. Windows Hello). Authenticators that only expose PRF during
  // an assertion are handled transparently by the lazy PRF enrollment performed
  // on the next login (see completeLoginWithRecovery / enroll-prf).
  const prfFirstBuffer: ArrayBuffer | null = extractPrfFirst(clientExtensionResults)

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
  const result = await apiJson<{ verified: boolean; userId: string }>(`${API_BASE}/register-verify`, {
    method: 'POST',
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
  if (result.verified) {
    setActiveMasterKey(masterKey)
    localStorage.setItem('active_username', username)
    localStorage.setItem('active_userid', result.userId)
    rememberUsername(username)
    sessionStorage.setItem('seed_demo_logbook', '1')
    trackPlausibleEvent(PlausibleEvents.ACCOUNT_CREATED)
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
  const options = await apiJson<any>(`${API_BASE}/login-options`, {
    method: 'POST',
    body: JSON.stringify({ username })
  })

  // Add PRF extension evaluation input.
  // When the server returned a concrete allowCredentials list we use
  // `evalByCredential` (keyed by the base64url credential id), which is the
  // spec-compliant form for assertions with an allow list. Some platform
  // authenticators (Windows Hello) reject plain `eval` in that case. For a
  // usernameless/discoverable assertion (empty allow list) `eval` is required.
  if (!options.extensions) {
    options.extensions = {}
  }

  // Some platform authenticators (notably Windows Hello) verify the user but
  // then fail the assertion when the PRF extension is requested. Once we have
  // observed that for a given account we remember it and stop requesting PRF on
  // subsequent logins, so the user only sees a single OS prompt instead of two.
  const prfSkipKey = username ? `prf_get_unsupported_${username.toLowerCase()}` : null
  const skipPrf = prfSkipKey ? localStorage.getItem(prfSkipKey) === '1' : false

  if (!skipPrf) {
    // When the server returned a concrete allowCredentials list we use
    // `evalByCredential` (keyed by the base64url credential id), the
    // spec-compliant form for assertions with an allow list. For a
    // usernameless/discoverable assertion (empty allow list) `eval` is required.
    const allowList: any[] = Array.isArray(options.allowCredentials) ? options.allowCredentials : []
    if (allowList.length > 0) {
      const evalByCredential: Record<string, { first: ArrayBuffer }> = {}
      for (const cred of allowList) {
        if (cred?.id) {
          evalByCredential[cred.id] = { first: PRF_SALT.buffer }
        }
      }
      options.extensions.prf = { evalByCredential }
    } else {
      options.extensions.prf = { eval: { first: PRF_SALT.buffer } }
    }
  }

  // 2. Start biometric Passkey verification.
  // If the PRF-enabled attempt fails, transparently retry once WITHOUT the PRF
  // extension so the user can still sign in (and fall back to PIN / recovery
  // phrase for the E2E key). A successful no-PRF retry is a strong signal that
  // PRF is the culprit, so we persist that to skip PRF next time.
  let credentialResponse
  const prfRequested = !!options.extensions?.prf
  try {
    credentialResponse = await startAuthentication({ optionsJSON: options })
  } catch (err: unknown) {
    // User cancelled or timed out — never open a second platform prompt.
    if (isWebAuthnUserAbortError(err)) {
      throw err
    }
    if (prfRequested) {
      console.warn('Passkey authentication with PRF extension failed, retrying without PRF:', err)
      if (options.extensions) {
        delete options.extensions.prf
      }
      credentialResponse = await startAuthentication({ optionsJSON: options })
      if (prfSkipKey) {
        localStorage.setItem(prfSkipKey, '1')
      }
    } else {
      throw err
    }
  }

  // 3. Verify assertion on the server
  const result = await apiJson<{
    verified: boolean
    userId: string
    username: string
    encryptedMasterKeyPrf: string | null
    encryptedMasterKeyPrfIv: string | null
    encryptedMasterKeyPrfTag: string | null
    encryptedMasterKeyRec: string
    encryptedMasterKeyRecIv: string
    encryptedMasterKeyRecTag: string
  }>(`${API_BASE}/login-verify`, {
    method: 'POST',
    body: JSON.stringify({
      credentialResponse,
      challenge: options.challenge
    })
  })
  if (!result.verified) {
    return { verified: false, prfSuccess: false }
  }

  const resolvedUsername = result.username

  // The WebAuthn assertion is verified at this point, so persist the identity
  // immediately. This must happen regardless of how the E2E master key is
  // ultimately obtained (PRF, PIN or recovery phrase) — otherwise a subsequent
  // PIN/recovery unlock leaves `active_userid` unset and every API call fails
  // with "User not authenticated".
  localStorage.setItem('active_username', resolvedUsername)
  localStorage.setItem('active_userid', result.userId)
  // Remember this account so future logins on this device need no typing.
  rememberUsername(resolvedUsername)

  // Try to decrypt master key using biometric PRF results
  const clientExtensionResults = credentialResponse.clientExtensionResults || {}
  console.log('WebAuthn client extension keys:', Object.keys(clientExtensionResults))
  const prfResults = (clientExtensionResults as any).prf
  console.log('PRF extension result present:', !!prfResults)
  if (prfResults) {
    console.log('PRF extension enabled:', prfResults.enabled)
    console.log('PRF extension results first present:', !!prfResults.results?.first)
  }

  if (
    prfResults?.results?.first &&
    result.encryptedMasterKeyPrf &&
    result.encryptedMasterKeyPrfIv &&
    result.encryptedMasterKeyPrfTag
  ) {
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
        await apiJson(`${API_BASE}/enroll-prf`, {
          method: 'POST',
          body: JSON.stringify({
            encryptedMasterKeyPrf: encryptedPrf.ciphertext,
            encryptedMasterKeyPrfIv: encryptedPrf.iv,
            encryptedMasterKeyPrfTag: encryptedPrf.tag
          })
        })
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

export async function logoutUser() {
  setActiveMasterKey(null)
  clearLogbookKeysCache()
  localStorage.removeItem('active_username')
  localStorage.removeItem('active_userid')
  try {
    await apiFetch(`${API_BASE}/logout`, { method: 'POST' })
  } catch {
    /* ignore network errors on logout */
  }
}

export async function deleteAccount(): Promise<boolean> {
  const username = localStorage.getItem('active_username')
  if (!localStorage.getItem('active_userid')) return false

  try {
    await reauthWithPasskey()

    const res = await apiFetch(`${API_BASE}/delete-account`, { method: 'DELETE' })

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
      await logoutUser()
      trackPlausibleEvent(PlausibleEvents.ACCOUNT_DELETED)
      return true
    }
  } catch (err) {
    console.error('Failed to delete account:', err)
  }
  return false
}

export interface UserProfileCredential {
  id: string
  label: string | null
  credentialIdPreview: string
  transports: string[]
}

export interface UserProfile {
  userId: string
  username: string
  createdAt: string
  hasPrfEncryption: boolean
  credentials: UserProfileCredential[]
  serverMeta: {
    ownedLogbookCount: number
    collaborationCount: number
  }
}

export async function fetchUserProfile(): Promise<UserProfile> {
  return apiJson<UserProfile>(`${API_BASE}/profile`)
}

async function enrollPrfFromMasterKey(masterKey: ArrayBuffer, prfFirst: ArrayBuffer): Promise<void> {
  const prfKey = await deriveKeyFromPrf(prfFirst)
  const encryptedPrf = await encryptBuffer(masterKey, prfKey)
  await apiJson(`${API_BASE}/enroll-prf`, {
    method: 'POST',
    body: JSON.stringify({
      encryptedMasterKeyPrf: encryptedPrf.ciphertext,
      encryptedMasterKeyPrfIv: encryptedPrf.iv,
      encryptedMasterKeyPrfTag: encryptedPrf.tag
    })
  })
}

export async function addPasskey(label?: string): Promise<void> {
  await reauthWithPasskey()

  const options = await apiJson<any>(`${API_BASE}/add-credential-options`, {
    method: 'POST'
  })

  if (!options.extensions) {
    options.extensions = {}
  }
  options.extensions.prf = { eval: { first: PRF_SALT.buffer } }

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
      console.warn('Add passkey with PRF extension failed, retrying without PRF:', err)
      if (options.extensions) {
        delete options.extensions.prf
      }
      credentialResponse = await startRegistration({ optionsJSON: options })
    } else {
      throw err
    }
  }

  await apiJson(`${API_BASE}/add-credential-verify`, {
    method: 'POST',
    body: JSON.stringify({
      credentialResponse,
      challenge: options.challenge,
      ...(label?.trim() ? { label: label.trim() } : {})
    })
  })

  const masterKey = getActiveMasterKey()
  const prfFirstBuffer = extractPrfFirst(credentialResponse.clientExtensionResults || {})
  if (masterKey && prfFirstBuffer) {
    try {
      await enrollPrfFromMasterKey(masterKey, prfFirstBuffer)
    } catch (err) {
      console.error('Failed to enroll PRF after adding passkey:', err)
    }
  }
}

export async function removePasskey(credentialDbId: string): Promise<void> {
  await reauthWithPasskey()

  const res = await apiFetch(`${API_BASE}/credentials/${credentialDbId}`, {
    method: 'DELETE'
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to remove passkey')
  }
}

export async function renamePasskey(credentialDbId: string, label: string): Promise<void> {
  await reauthWithPasskey()

  await apiJson(`${API_BASE}/credentials/${credentialDbId}`, {
    method: 'PATCH',
    body: JSON.stringify({ label })
  })
}

export async function rotateRecoveryPhrase(): Promise<string> {
  const masterKey = getActiveMasterKey()
  if (!masterKey) {
    throw new Error('NO_ACTIVE_MASTER_KEY')
  }

  await reauthWithPasskey()

  const recoveryPhrase = generateRecoveryPhrase()
  const recoveryKey = await deriveKeyFromPhrase(recoveryPhrase)
  const encryptedRecovery = await encryptBuffer(masterKey, recoveryKey)

  await apiJson(`${API_BASE}/rotate-recovery`, {
    method: 'POST',
    body: JSON.stringify({
      encryptedMasterKeyRec: encryptedRecovery.ciphertext,
      encryptedMasterKeyRecIv: encryptedRecovery.iv,
      encryptedMasterKeyRecTag: encryptedRecovery.tag
    })
  })

  return recoveryPhrase
}
