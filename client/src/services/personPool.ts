import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { decryptJson, encryptJson } from './crypto.js'
import type { PersonData } from '../types/person.js'
import { MAX_POOL_CREW_MEMBERS } from '../types/person.js'
import { syncPersonPool } from './personPoolSync.js'

export interface DecryptedPerson {
  payloadId: string
  data: PersonData
}

function requireMasterKey(): ArrayBuffer {
  const key = getActiveMasterKey()
  if (!key) throw new Error('Encryption key not found. Please log in.')
  return key
}

export async function loadPersonPool(): Promise<DecryptedPerson[]> {
  const masterKey = requireMasterKey()
  const records = await db.personPool.toArray()
  const result: DecryptedPerson[] = []

  for (const record of records) {
    const data = (await decryptJson(record.encryptedData, record.iv, record.tag, masterKey)) as
      | PersonData
      | null
    if (data) {
      result.push({ payloadId: record.payloadId, data })
    }
  }

  result.sort((a, b) => {
    if (a.data.role !== b.data.role) return a.data.role === 'skipper' ? -1 : 1
    return a.data.name.localeCompare(b.data.name, undefined, { sensitivity: 'base' })
  })

  return result
}

export async function loadPersonPoolMap(): Promise<Map<string, PersonData>> {
  const people = await loadPersonPool()
  return new Map(people.map((p) => [p.payloadId, p.data]))
}

export async function savePerson(
  payloadId: string,
  data: PersonData,
  isNew: boolean
): Promise<void> {
  if (data.role === 'crew' && isNew) {
    const crewCount = await db.personPool
      .toArray()
      .then(async (rows) => {
        let count = 0
        const masterKey = requireMasterKey()
        for (const row of rows) {
          const dec = (await decryptJson(row.encryptedData, row.iv, row.tag, masterKey)) as PersonData | null
          if (dec?.role === 'crew') count++
        }
        return count
      })
    if (crewCount >= MAX_POOL_CREW_MEMBERS) {
      throw new Error('MAX_CREW')
    }
  }

  const masterKey = requireMasterKey()
  const encrypted = await encryptJson(data, masterKey)
  const now = new Date().toISOString()

  await db.personPool.put({
    payloadId,
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    tag: encrypted.tag,
    updatedAt: now
  })

  await db.userSyncQueue.put({
    action: isNew ? 'create' : 'update',
    type: 'person',
    payloadId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  syncPersonPool().catch((err) => console.warn('Person pool sync failed:', err))
}

export async function deletePerson(payloadId: string): Promise<void> {
  const now = new Date().toISOString()
  await db.personPool.delete(payloadId)
  await db.userSyncQueue.put({
    action: 'delete',
    type: 'person',
    payloadId,
    data: '',
    updatedAt: now
  })
  syncPersonPool().catch((err) => console.warn('Person pool sync failed:', err))
}

export function filterSkippers(people: DecryptedPerson[]): DecryptedPerson[] {
  return people.filter((p) => p.data.role === 'skipper')
}

export function filterCrew(people: DecryptedPerson[]): DecryptedPerson[] {
  return people.filter((p) => p.data.role === 'crew')
}
