import { db, type LocalLogbook } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { encryptJson, decryptJson, encryptBuffer, decryptBuffer } from './crypto.js'
import { getLogbookKey, saveLogbookKey, generateLogbookKey } from './logbookKeys.js'

const API_BASE = '/api/logbooks'

export interface DecryptedLogbook {
  id: string
  title: string
  updatedAt: string
  isSynced: boolean
  isShared: boolean
  isDemo?: boolean
}

// Helper to decrypt a logbook's title using the active logbook key or master key
export async function decryptLogbookTitle(logbookId: string, encryptedTitle: string): Promise<string> {
  const masterKey = getActiveMasterKey()
  if (!masterKey) {
    throw new Error('Master key not found. User must log in.')
  }

  try {
    const parsed = JSON.parse(encryptedTitle)
    const key = await getLogbookKey(logbookId) || masterKey
    const decrypted = await decryptJson(parsed.ciphertext, parsed.iv, parsed.tag, key)
    return decrypted
  } catch (error) {
    console.error('Failed to decrypt logbook title:', error)
    return '[Decryption Failed]'
  }
}

// Fetch logbooks from the server (if online) and update local cache, falling back to cache if offline
export async function fetchLogbooks(): Promise<DecryptedLogbook[]> {
  const userId = localStorage.getItem('active_userid')
  if (!userId) {
    throw new Error('User not authenticated')
  }

  const masterKey = getActiveMasterKey()
  if (!masterKey) {
    throw new Error('Master key not found. User must log in.')
  }

  if (navigator.onLine) {
    try {
      const response = await fetch(API_BASE, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        }
      })

      if (response.ok) {
        const serverLogbooks = await response.json()
        
        // Decrypt and save logbook keys locally if they exist
        for (const lb of serverLogbooks) {
          const isShared = lb.userId !== userId

          const encryptedKeyStr = isShared
            ? lb.collaborators?.[0]?.encryptedLogbookKey
            : (lb.encryptedKey || lb.collaborators?.[0]?.encryptedLogbookKey)
          const ivStr = isShared
            ? lb.collaborators?.[0]?.iv
            : (lb.iv || lb.collaborators?.[0]?.iv)
          const tagStr = isShared
            ? lb.collaborators?.[0]?.tag
            : (lb.tag || lb.collaborators?.[0]?.tag)

          if (encryptedKeyStr && ivStr && tagStr) {
            try {
              const aesKey = await window.crypto.subtle.importKey(
                'raw',
                masterKey,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
              )
              const decryptedKey = await decryptBuffer(encryptedKeyStr, ivStr, tagStr, aesKey)
              await saveLogbookKey(lb.id, decryptedKey)
            } catch (err) {
              console.error(`Failed to decrypt and save logbook key for logbook ${lb.id}:`, err)
            }
          } else if (isShared) {
            console.warn(`Shared logbook ${lb.id} is missing collaboration key on server`)
          }
        }
        // Clear local cache for any logbooks that are no longer on the server
        const serverIds = new Set(serverLogbooks.map((lb: any) => lb.id))
        const localLogbooksArray = await db.logbooks.toArray()
        for (const lb of localLogbooksArray) {
          if (lb.isSynced === 1 && !serverIds.has(lb.id)) {
            await deleteLocalLogbookCache(lb.id)
          }
        }

        // Update Dexie database cache
        const localById = new Map(localLogbooksArray.map((lb) => [lb.id, lb]))
        const localLogbooks: LocalLogbook[] = serverLogbooks.map((lb: any) => ({
          id: lb.id,
          encryptedTitle: lb.encryptedTitle,
          updatedAt: lb.updatedAt || new Date().toISOString(),
          isSynced: 1,
          isShared: lb.userId !== userId ? 1 : 0,
          isDemo: localById.get(lb.id)?.isDemo
        }))

        // Clear existing cache for this user and insert new ones
        await db.logbooks.bulkPut(localLogbooks)
      }
    } catch (error) {
      console.warn('Network request failed. Reading logbooks from offline cache:', error)
    }
  }

  // Retrieve all from Dexie cache
  const cachedLogbooks = await db.logbooks.toArray()
  
  // Decrypt titles
  const decrypted: DecryptedLogbook[] = []
  for (const lb of cachedLogbooks) {
    const title = await decryptLogbookTitle(lb.id, lb.encryptedTitle)
    decrypted.push({
      id: lb.id,
      title,
      updatedAt: lb.updatedAt,
      isSynced: lb.isSynced === 1,
      isShared: lb.isShared === 1,
      isDemo: lb.isDemo === 1
    })
  }

  return decrypted
}

// Create a new logbook. Encrypts the title and registers locally + on server
export async function createLogbook(title: string): Promise<DecryptedLogbook> {
  const userId = localStorage.getItem('active_userid')
  if (!userId) {
    throw new Error('User not authenticated')
  }

  const masterKey = getActiveMasterKey()
  if (!masterKey) {
    throw new Error('Master key not found. User must log in.')
  }

  // 1. Generate Logbook Key and save it locally
  const logbookKey = generateLogbookKey()
  await saveLogbookKey(localIdForCreate(), logbookKey) // Generate temporary ID to bind to key

  const localId = tempUUID
  const now = new Date().toISOString()

  // 2. Encrypt logbook key with user's master key
  const aesMasterKey = await window.crypto.subtle.importKey(
    'raw',
    masterKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const encryptedKey = await encryptBuffer(logbookKey, aesMasterKey)

  // 3. E2E Encrypt title using the Logbook Key
  const encrypted = await encryptJson(title, logbookKey)
  const encryptedTitleStr = JSON.stringify(encrypted)

  const payloadData = {
    encryptedTitle: encryptedTitleStr,
    encryptedKey: encryptedKey.ciphertext,
    iv: encryptedKey.iv,
    tag: encryptedKey.tag
  }

  if (navigator.onLine) {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify({
          id: localId,
          ...payloadData
        })
      })

      if (response.ok) {
        const serverLb = await response.json()
        await db.logbooks.put({
          id: serverLb.id,
          encryptedTitle: serverLb.encryptedTitle,
          updatedAt: serverLb.updatedAt,
          isSynced: 1,
          isShared: 0
        })

        return {
          id: serverLb.id,
          title,
          updatedAt: serverLb.updatedAt,
          isSynced: true,
          isShared: false
        }
      }
    } catch (error) {
      console.warn('Failed to save logbook to server, saving locally instead:', error)
    }
  }

  // If offline or request failed, store locally as unsynced and add to queue
  await db.logbooks.put({
    id: localId,
    encryptedTitle: encryptedTitleStr,
    updatedAt: now,
    isSynced: 0,
    isShared: 0
  })

  await db.syncQueue.put({
    action: 'create',
    type: 'logbook',
    payloadId: localId,
    logbookId: localId,
    data: JSON.stringify(payloadData),
    updatedAt: now
  })

  return {
    id: localId,
    title,
    updatedAt: now,
    isSynced: false,
    isShared: false
  }
}

// Temporary UUID helpers to preserve single localId assignment across generation
let tempUUID = ''
function localIdForCreate(): string {
  tempUUID = window.crypto.randomUUID()
  return tempUUID
}

// Perform cascading deletion on all local Dexie tables for a specific logbook ID
export async function deleteLocalLogbookCache(id: string): Promise<void> {
  await db.logbooks.delete(id)
  await db.yachts.where({ logbookId: id }).delete()
  await db.crews.where({ logbookId: id }).delete()
  await db.deviations.where({ logbookId: id }).delete()
  await db.entries.where({ logbookId: id }).delete()
  await db.photos.where({ logbookId: id }).delete()
  await db.gpsTracks.where({ logbookId: id }).delete()
  await db.syncQueue.where({ logbookId: id }).delete()
  await db.logbookKeys.where({ logbookId: id }).delete()
}

// Delete a logbook and all associated payloads locally and on server
export async function deleteLogbook(id: string): Promise<void> {
  const userId = localStorage.getItem('active_userid')
  if (!userId) {
    throw new Error('User not authenticated')
  }

  if (navigator.onLine) {
    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: {
          'X-User-Id': userId
        }
      })
      if (!response.ok) {
        console.warn('Server deletion failed or was rejected')
      }
    } catch (error) {
      console.warn('Server delete request failed, queuing locally:', error)
      await db.syncQueue.put({
        action: 'delete',
        type: 'logbook',
        payloadId: id,
        logbookId: id,
        data: '',
        updatedAt: new Date().toISOString()
      })
    }
  } else {
    await db.syncQueue.put({
      action: 'delete',
      type: 'logbook',
      payloadId: id,
      logbookId: id,
      data: '',
      updatedAt: new Date().toISOString()
    })
  }

  // Perform local cascading cleanup
  await deleteLocalLogbookCache(id)
}
