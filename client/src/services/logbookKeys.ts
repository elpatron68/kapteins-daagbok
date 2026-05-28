import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { encryptBuffer, decryptBuffer, generateMasterKey, decryptJson } from './crypto.js'

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

  try {
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
  } catch (err) {
    console.warn(`Failed to decrypt logbook key for ${logbookId}, returning null to allow fallback:`, err)
    return null
  }
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

export async function ensureLogbookKey(logbookId: string): Promise<ArrayBuffer> {
  const localLb = await db.logbooks.get(logbookId)
  const encryptedTitle = localLb ? localLb.encryptedTitle : ''
  const masterKey = getActiveMasterKey()

  let key = await getLogbookKey(logbookId)

  // Self-healing migration for legacy logbooks that got a wrong key generated
  if (key && encryptedTitle && masterKey) {
    try {
      const parsed = JSON.parse(encryptedTitle)
      await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, key)
      // Key works, return it
      return key
    } catch (err) {
      console.warn('Stored logbook key failed to decrypt title. Testing if master key works (legacy migration)...')
      try {
        const parsed = JSON.parse(encryptedTitle)
        await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, masterKey)
        
        // Decryption succeeded with master key! Update logbook key to master key.
        console.info('Legacy logbook detected. Repairing logbook key to match master key...')
        key = masterKey
        await saveLogbookKey(logbookId, key)

        // Sync the repaired key to the server
        const aesMasterKey = await window.crypto.subtle.importKey(
          'raw',
          masterKey,
          { name: 'AES-GCM' },
          false,
          ['encrypt']
        )
        const encrypted = await encryptBuffer(key, aesMasterKey)
        const payloadData = {
          encryptedTitle,
          encryptedKey: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag
        }
        await db.syncQueue.put({
          action: 'create',
          type: 'logbook',
          payloadId: logbookId,
          logbookId,
          data: JSON.stringify(payloadData),
          updatedAt: new Date().toISOString()
        })
        return key
      } catch (masterErr) {
        console.error('Neither logbook key nor master key can decrypt title.', masterErr)
      }
    }
  }

  // If no logbook key exists yet
  if (!key) {
    if (encryptedTitle && masterKey) {
      try {
        // Check if title is already decryptable using masterKey (meaning it is a legacy logbook)
        const parsed = JSON.parse(encryptedTitle)
        await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, masterKey)
        
        // Yes, legacy logbook! Re-use masterKey as the logbook key so existing data is decryptable.
        console.info('Using master key for legacy logbook key...')
        key = masterKey
      } catch (err) {
        // Not decryptable with masterKey, generate new random key
        key = generateLogbookKey()
      }
    } else {
      key = generateLogbookKey()
    }

    await saveLogbookKey(logbookId, key)

    if (masterKey) {
      const aesMasterKey = await window.crypto.subtle.importKey(
        'raw',
        masterKey,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      )
      const encrypted = await encryptBuffer(key, aesMasterKey)
      const payloadData = {
        encryptedTitle,
        encryptedKey: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag
      }
      await db.syncQueue.put({
        action: 'create',
        type: 'logbook',
        payloadId: logbookId,
        logbookId,
        data: JSON.stringify(payloadData),
        updatedAt: new Date().toISOString()
      })
    }
  }

  return key
}
