import { createLogbook } from './logbook.js'
import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { encryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'
import i18n from '../i18n/index.js'
import {
  buildDemoCrewRecords,
  buildDemoEntryPayloads,
  buildDemoYachtData
} from './demoLogbookData.js'

export const SEED_DEMO_FLAG = 'seed_demo_logbook'

export function getDemoLogbookStorageKey(userId: string): string {
  return `demo_logbook_id_${userId}`
}

export function getDemoFirstEntryStorageKey(userId: string): string {
  return `demo_first_entry_id_${userId}`
}

async function putEncryptedRecord(
  logbookId: string,
  key: ArrayBuffer,
  type: 'entry' | 'crew' | 'yacht' | 'gpsTrack',
  payloadId: string,
  data: unknown,
  now: string
): Promise<void> {
  const encrypted = await encryptJson(data, key)

  if (type === 'entry') {
    await db.entries.put({
      payloadId,
      logbookId,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      updatedAt: now
    })
  } else if (type === 'crew') {
    await db.crews.put({
      payloadId,
      logbookId,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      updatedAt: now
    })
  } else if (type === 'yacht') {
    await db.yachts.put({
      logbookId,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      updatedAt: now
    })
  } else if (type === 'gpsTrack') {
    await db.gpsTracks.put({
      entryId: payloadId,
      logbookId,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      updatedAt: now
    })
  }

  await db.syncQueue.put({
    action: type === 'yacht' ? 'update' : 'create',
    type,
    payloadId: type === 'yacht' ? logbookId : payloadId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })
}

async function seedYachtAndCrew(logbookId: string, key: ArrayBuffer, now: string): Promise<void> {
  const yachtData = buildDemoYachtData()
  await putEncryptedRecord(logbookId, key, 'yacht', logbookId, yachtData, now)

  for (const crew of buildDemoCrewRecords()) {
    await putEncryptedRecord(logbookId, key, 'crew', crew.payloadId, crew.data, now)
  }
}

export interface DemoSeedResult {
  logbookId: string
  title: string
  firstEntryId: string
}

export async function seedDemoLogbookIfNeeded(): Promise<DemoSeedResult | null> {
  const userId = localStorage.getItem('active_userid')
  if (!userId || !getActiveMasterKey()) return null

  const shouldSeed = sessionStorage.getItem(SEED_DEMO_FLAG) === '1'
  const existingId = localStorage.getItem(getDemoLogbookStorageKey(userId))

  if (existingId) {
    const existing = await db.logbooks.get(existingId)
    if (existing) {
      if (shouldSeed) sessionStorage.removeItem(SEED_DEMO_FLAG)
      const firstEntryId = localStorage.getItem(getDemoFirstEntryStorageKey(userId)) || ''
      const title = i18n.t('demo.logbook_title')
      return { logbookId: existingId, title, firstEntryId }
    }
  }

  if (!shouldSeed) return null
  sessionStorage.removeItem(SEED_DEMO_FLAG)

  const title = i18n.t('demo.logbook_title')
  const logbook = await createLogbook(title)
  const logbookId = logbook.id

  await db.logbooks.update(logbookId, { isDemo: 1 })
  localStorage.setItem(getDemoLogbookStorageKey(userId), logbookId)

  const key = (await getLogbookKey(logbookId)) || getActiveMasterKey()
  if (!key) throw new Error('Encryption key not available for demo seed')

  const now = new Date().toISOString()
  await seedYachtAndCrew(logbookId, key, now)

  const entryPayloads = buildDemoEntryPayloads()
  let firstEntryId = ''

  for (const { entryId, entryPayload, trackData } of entryPayloads) {
    if (!firstEntryId) firstEntryId = entryId
    await putEncryptedRecord(logbookId, key, 'entry', entryId, entryPayload, now)
    await putEncryptedRecord(logbookId, key, 'gpsTrack', entryId, trackData, now)
  }

  localStorage.setItem(getDemoFirstEntryStorageKey(userId), firstEntryId)
  syncLogbook(logbookId).catch((err) => console.warn('Demo logbook sync failed:', err))

  return { logbookId, title, firstEntryId }
}

export function getStoredDemoLogbookId(): string | null {
  const userId = localStorage.getItem('active_userid')
  if (!userId) return null
  return localStorage.getItem(getDemoLogbookStorageKey(userId))
}

export function getStoredDemoFirstEntryId(): string | null {
  const userId = localStorage.getItem('active_userid')
  if (!userId) return null
  return localStorage.getItem(getDemoFirstEntryStorageKey(userId))
}
