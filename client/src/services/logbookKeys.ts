import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { encryptBuffer, decryptBuffer, generateMasterKey } from './crypto.js'

// In-memory cache of decrypted logbook keys (ArrayBuffer)
const keyCache = new Map<string, ArrayBuffer>()

/**
 * Retrieves the logbook-specific key for a given logbookId.
 * Falls back to the user's master key if no logbook-specific key exists (legacy logbooks).
 */
export async function getLogbookKey(logbookId: string): Promise<ArrayBuffer | null> {
  if (keyCache.has(logbookId)) {
    return keyCache.get(logbookId)!
  }

  const record = await db.logbookKeys.get(logbookId)
  if (!record) {
    return null // Caller will fall back to getActiveMasterKey()
  }

  const masterKeyBytes = getActiveMasterKey()
  if (!masterKeyBytes) {
    throw new Error('Master key not found. Please log in.')
  }

  // Derive CryptoKey from user master key
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  // Decrypt logbook key using User Master Key
  const decrypted = await decryptBuffer(record.encryptedKey, record.iv, record.tag, aesKey)
  keyCache.set(logbookId, decrypted)
  return decrypted
}

/**
 * Encrypts and stores a logbook-specific key in the local IndexedDB.
 */
export async function saveLogbookKey(logbookId: string, logbookKeyBuffer: ArrayBuffer): Promise<void> {
  const masterKeyBytes = getActiveMasterKey()
  if (!masterKeyBytes) {
    throw new Error('Master key not found. Please log in.')
  }

  // Derive CryptoKey from user master key
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )

  const encrypted = await encryptBuffer(logbookKeyBuffer, aesKey)
  
  await db.logbookKeys.put({
    logbookId,
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag
  })

  keyCache.set(logbookId, logbookKeyBuffer)
}

/**
 * Generates a new random 256-bit logbook key.
 */
export function generateLogbookKey(): ArrayBuffer {
  return generateMasterKey() // 32 random bytes
}

/**
 * Clears the in-memory logbook key cache (called on logout).
 */
export function clearLogbookKeysCache() {
  keyCache.clear()
}

/**
 * Ensures a logbook-specific key exists for a given logbookId.
 * If not, it generates a key, encrypts it with the user's master key, saves it locally and in the sync queue.
 */
export async function ensureLogbookKey(logbookId: string): Promise<ArrayBuffer> {
  let key = await getLogbookKey(logbookId)
  if (key) return key

  // Generate new key
  key = generateLogbookKey()
  await saveLogbookKey(logbookId, key)

  // Encrypt it with user master key
  const masterKey = getActiveMasterKey()
  if (!masterKey) throw new Error('Master key not found')

  const aesMasterKey = await window.crypto.subtle.importKey(
    'raw',
    masterKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const encrypted = await encryptBuffer(key, aesMasterKey)

  // Retrieve local logbook details to preserve encryptedTitle
  const localLb = await db.logbooks.get(logbookId)
  const encryptedTitle = localLb ? localLb.encryptedTitle : ''

  const payloadData = {
    encryptedTitle,
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag
  }

  // Put in sync queue to update the server logbook record with the key
  await db.syncQueue.put({
    action: 'create', // Server sync treats create as upsert
    type: 'logbook',
    payloadId: logbookId,
    logbookId,
    data: JSON.stringify(payloadData),
    updatedAt: new Date().toISOString()
  })

  return key
}
