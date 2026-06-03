import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { ensureLogbookKey, getLogbookKey } from './logbookKeys.js'
import { decryptJson, encryptJson } from './crypto.js'
import { syncLogbook } from './sync.js'
import { putEntryRecord } from '../utils/entryListCache.js'
import {
  buildLogEntryPayload,
  normalizeLogEvent,
  sortLogEventsByTime,
  currentLocalTimeHHMM,
  type LogEventPayload
} from '../utils/logEntryPayload.js'
import {
  carryOverFromPreviousDay,
  compareTravelDaysChronological,
  getNextTravelDayNumber,
  type LogEntryTankSource,
  type TravelDaySortable
} from '../utils/logEntryTankLevels.js'

export interface LoadedEntry {
  payloadId: string
  updatedAt: string
  data: Record<string, unknown>
}

type EncryptedRecord = {
  encryptedData: string
  iv: string
  tag: string
}

async function getMasterKey(logbookId: string): Promise<ArrayBuffer> {
  const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
  if (!masterKey) throw new Error('Encryption key not found. Please log in.')
  return masterKey
}

/** Decrypt one record; skip corrupt or legacy entries instead of aborting the whole scan. */
export async function tryDecryptEntryPayload(
  record: EncryptedRecord,
  key: ArrayBuffer
): Promise<Record<string, unknown> | null> {
  try {
    return await decryptJson(record.encryptedData, record.iv, record.tag, key)
  } catch {
    return null
  }
}

function sortEntriesNewestFirst<T extends { updatedAt: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

function tankLevelsFromData(data: Record<string, unknown>) {
  const fw = (data.freshwater as Record<string, number> | undefined) ?? {
    morning: 0, refilled: 0, evening: 0, consumption: 0
  }
  const fuel = (data.fuel as Record<string, number> | undefined) ?? {
    morning: 0, refilled: 0, evening: 0, consumption: 0
  }
  const gw = data.greywater as { level?: number } | undefined
  return { fw, fuel, gw }
}

function buildEncryptedPayload(
  data: Record<string, unknown>,
  options: {
    events: LogEventPayload[]
    departure?: string
    destination?: string
    freshwater?: { morning: number; refilled: number; evening: number; consumption: number }
    fuel?: { morning: number; refilled: number; evening: number; consumption: number }
    clearSignatures?: boolean
  }
): Record<string, unknown> {
  const { fw, fuel, gw } = tankLevelsFromData(data)
  const trackDistance = data.trackDistanceNm
  const trackSpeedMax = data.trackSpeedMaxKn
  const trackSpeedAvg = data.trackSpeedAvgKn
  const motorHoursRaw = data.motorHours

  const freshwater = options.freshwater ?? {
    morning: fw.morning || 0,
    refilled: fw.refilled || 0,
    evening: fw.evening || 0,
    consumption: fw.consumption ?? 0
  }
  const fuelLevels = options.fuel ?? {
    morning: fuel.morning || 0,
    refilled: fuel.refilled || 0,
    evening: fuel.evening || 0,
    consumption: fuel.consumption ?? 0
  }

  const payload = buildLogEntryPayload({
    date: String(data.date || ''),
    dayOfTravel: String(data.dayOfTravel || ''),
    departure: options.departure ?? String(data.departure || ''),
    destination: options.destination ?? String(data.destination || ''),
    freshwater,
    fuel: fuelLevels,
    greywater: gw ? { level: gw.level || 0 } : undefined,
    trackDistanceNm:
      trackDistance != null && trackDistance !== ''
        ? parseFloat(String(trackDistance))
        : undefined,
    trackSpeedMaxKn:
      trackSpeedMax != null && trackSpeedMax !== ''
        ? parseFloat(String(trackSpeedMax))
        : undefined,
    trackSpeedAvgKn:
      trackSpeedAvg != null && trackSpeedAvg !== ''
        ? parseFloat(String(trackSpeedAvg))
        : undefined,
    motorHours:
      motorHoursRaw != null && motorHoursRaw !== ''
        ? parseFloat(String(motorHoursRaw))
        : undefined,
    events: options.events
  })

  const clear = options.clearSignatures
  const entryData: Record<string, unknown> = {
    ...payload,
    signSkipper: clear ? '' : (data.signSkipper ?? ''),
    signCrew: clear ? '' : (data.signCrew ?? '')
  }

  const summary = typeof data.aiSummary === 'string' ? data.aiSummary.trim() : ''
  if (summary) {
    entryData.aiSummary = summary
    entryData.aiSummaryGeneratedAt =
      typeof data.aiSummaryGeneratedAt === 'string' && data.aiSummaryGeneratedAt
        ? data.aiSummaryGeneratedAt
        : new Date().toISOString()
  }

  return entryData
}

export async function loadEntry(logbookId: string, entryId: string): Promise<LoadedEntry | null> {
  const masterKey = await getMasterKey(logbookId)
  const record = await db.entries.get(entryId)
  if (!record) return null
  const data = await tryDecryptEntryPayload(record, masterKey)
  if (!data) return null
  return { payloadId: record.payloadId, updatedAt: record.updatedAt, data }
}

export async function findTodayEntryId(logbookId: string): Promise<string | null> {
  const todayStr = new Date().toISOString().substring(0, 10)
  const masterKey = await getMasterKey(logbookId)
  const local = sortEntriesNewestFirst(await db.entries.where({ logbookId }).toArray())

  for (const entry of local) {
    const decrypted = await tryDecryptEntryPayload(entry, masterKey)
    if (decrypted && String(decrypted.date) === todayStr) {
      return entry.payloadId
    }
  }
  return null
}

export async function createTodayEntry(logbookId: string): Promise<string> {
  const masterKey = await getMasterKey(logbookId)
  const localEntries = await db.entries.where({ logbookId }).toArray()
  const decryptedEntries: Array<LogEntryTankSource & TravelDaySortable> = []

  if (localEntries.length > 0) {
    for (const entry of localEntries) {
      const decrypted = await tryDecryptEntryPayload(entry, masterKey)
      if (decrypted) {
        decryptedEntries.push(decrypted as LogEntryTankSource & TravelDaySortable)
      }
    }
  }

  decryptedEntries.sort(compareTravelDaysChronological)
  const previousEntry = decryptedEntries.at(-1) ?? null
  const { freshwater, fuel, greywaterLevel, departure } = carryOverFromPreviousDay(previousEntry)

  const localId = window.crypto.randomUUID()
  const nowStr = new Date().toISOString()
  const todayStr = nowStr.substring(0, 10)

  const initialPayload = {
    date: todayStr,
    dayOfTravel: getNextTravelDayNumber(decryptedEntries),
    departure,
    destination: '',
    freshwater,
    fuel,
    ...(greywaterLevel > 0 ? { greywater: { level: greywaterLevel } } : {}),
    signSkipper: '',
    signCrew: '',
    events: []
  }

  const encrypted = await encryptJson(initialPayload, masterKey)

  await putEntryRecord(
    {
      payloadId: localId,
      logbookId,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      updatedAt: nowStr
    },
    initialPayload
  )

  await db.syncQueue.put({
    action: 'create',
    type: 'entry',
    payloadId: localId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: nowStr
  })

  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
  return localId
}

export async function findOrCreateTodayEntry(logbookId: string): Promise<string> {
  const id = logbookId.trim()
  if (!id) throw new Error('Logbook id required')

  await ensureLogbookKey(id)

  const entryCount = await db.entries.where({ logbookId: id }).count()
  if (entryCount === 0) {
    return createTodayEntry(id)
  }

  const existing = await findTodayEntryId(id)
  if (existing) return existing
  return createTodayEntry(id)
}

export interface AppendQuickEventResult {
  events: LogEventPayload[]
  hadSignature: boolean
}

export async function appendQuickEvent(
  logbookId: string,
  entryId: string,
  partialEvent: Partial<LogEventPayload>,
  headerPatch?: { departure?: string; destination?: string }
): Promise<AppendQuickEventResult> {
  const loaded = await loadEntry(logbookId, entryId)
  if (!loaded) throw new Error('Entry not found')

  const hadSignature = !!(loaded.data.signSkipper || loaded.data.signCrew)
  const currentEvents = (loaded.data.events as LogEventPayload[]) || []
  const newEvent = normalizeLogEvent({
    time: currentLocalTimeHHMM(),
    ...partialEvent
  })
  const nextEvents = sortLogEventsByTime([...currentEvents, newEvent])

  await persistEntry(logbookId, entryId, loaded.data, {
    events: nextEvents,
    departure: headerPatch?.departure,
    destination: headerPatch?.destination,
    clearSignatures: hadSignature
  })

  return { events: nextEvents, hadSignature }
}

/** Append multiple events in one load/encrypt/persist cycle (avoids UI freezes). */
export async function appendQuickEvents(
  logbookId: string,
  entryId: string,
  partialEvents: Partial<LogEventPayload>[]
): Promise<AppendQuickEventResult> {
  const loaded = await loadEntry(logbookId, entryId)
  if (!loaded) throw new Error('Entry not found')

  const hadSignature = !!(loaded.data.signSkipper || loaded.data.signCrew)
  const currentEvents = (loaded.data.events as LogEventPayload[]) || []
  if (partialEvents.length === 0) {
    return { events: currentEvents, hadSignature }
  }

  const time = currentLocalTimeHHMM()
  const newEvents = partialEvents.map((partial) =>
    normalizeLogEvent({ time, ...partial })
  )
  const nextEvents = sortLogEventsByTime([...currentEvents, ...newEvents])

  await persistEntry(logbookId, entryId, loaded.data, {
    events: nextEvents,
    clearSignatures: hadSignature
  })

  return { events: nextEvents, hadSignature }
}

async function persistEntry(
  logbookId: string,
  entryId: string,
  data: Record<string, unknown>,
  options: Parameters<typeof buildEncryptedPayload>[1]
): Promise<void> {
  const hadSignature = !!(data.signSkipper || data.signCrew)
  const entryData = buildEncryptedPayload(data, {
    ...options,
    clearSignatures: options.clearSignatures ?? hadSignature
  })

  const masterKey = await getMasterKey(logbookId)
  const encrypted = await encryptJson(entryData, masterKey)
  const now = new Date().toISOString()

  await putEntryRecord(
    {
      payloadId: entryId,
      logbookId,
      encryptedData: encrypted.ciphertext,
      iv: encrypted.iv,
      tag: encrypted.tag,
      updatedAt: now
    },
    entryData
  )

  await db.syncQueue.put({
    action: 'update',
    type: 'entry',
    payloadId: entryId,
    logbookId,
    data: JSON.stringify(encrypted),
    updatedAt: now
  })

  syncLogbook(logbookId).catch((err) => console.warn('Background sync failed:', err))
}

export async function removeLastEvent(
  logbookId: string,
  entryId: string
): Promise<LogEventPayload[]> {
  const loaded = await loadEntry(logbookId, entryId)
  if (!loaded) throw new Error('Entry not found')

  const currentEvents = (loaded.data.events as LogEventPayload[]) || []
  if (currentEvents.length === 0) return []

  const nextEvents = sortLogEventsByTime(currentEvents.slice(0, -1))
  await persistEntry(logbookId, entryId, loaded.data, { events: nextEvents })
  return nextEvents
}

export async function appendTankRefill(
  logbookId: string,
  entryId: string,
  tank: 'fuel' | 'freshwater',
  addLiters: number,
  event: Partial<LogEventPayload>
): Promise<AppendQuickEventResult> {
  const loaded = await loadEntry(logbookId, entryId)
  if (!loaded) throw new Error('Entry not found')

  const { fw, fuel } = tankLevelsFromData(loaded.data)
  const currentEvents = (loaded.data.events as LogEventPayload[]) || []
  const newEvent = normalizeLogEvent({
    time: currentLocalTimeHHMM(),
    ...event
  })
  const nextEvents = sortLogEventsByTime([...currentEvents, newEvent])

  const tankPatch = tank === 'fuel'
    ? {
        fuel: {
          morning: fuel.morning || 0,
          refilled: (fuel.refilled || 0) + addLiters,
          evening: fuel.evening || 0,
          consumption: fuel.consumption ?? 0
        }
      }
    : {
        freshwater: {
          morning: fw.morning || 0,
          refilled: (fw.refilled || 0) + addLiters,
          evening: fw.evening || 0,
          consumption: fw.consumption ?? 0
        }
      }

  const hadSignature = !!(loaded.data.signSkipper || loaded.data.signCrew)
  await persistEntry(logbookId, entryId, loaded.data, {
    events: nextEvents,
    ...tankPatch,
    clearSignatures: hadSignature
  })

  return { events: nextEvents, hadSignature }
}
