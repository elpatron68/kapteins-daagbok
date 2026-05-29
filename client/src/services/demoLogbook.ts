import { createLogbook } from './logbook.js'
import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { encryptJson } from './crypto.js'
import { parseTrackFile } from './trackUpload.js'
import { syncLogbook } from './sync.js'
import { computeTrackStats } from '../utils/trackStats.js'
import i18n from '../i18n/index.js'

import kielLaboeGpx from '../assets/demo/kiel-laboe.gpx?raw'
import laboeDampGpx from '../assets/demo/laboe-damp.gpx?raw'
import dampSchleimuendeGpx from '../assets/demo/damp-schleimuende.gpx?raw'

export const SEED_DEMO_FLAG = 'seed_demo_logbook'

export function getDemoLogbookStorageKey(userId: string): string {
  return `demo_logbook_id_${userId}`
}

export function getDemoFirstEntryStorageKey(userId: string): string {
  return `demo_first_entry_id_${userId}`
}

interface DemoDaySpec {
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  gpx: string
  filename: string
  freshwater: { morning: number; refilled: number; evening: number; consumption: number }
  fuel: { morning: number; refilled: number; evening: number; consumption: number }
  events: Array<Record<string, string>>
}

function buildDemoDays(): DemoDaySpec[] {
  const isDe = i18n.language.startsWith('de')
  return [
    {
      date: '2026-05-29',
      dayOfTravel: '1',
      departure: isDe ? 'Kiel' : 'Kiel',
      destination: isDe ? 'Laboe' : 'Laboe',
      gpx: kielLaboeGpx,
      filename: 'kiel-laboe.gpx',
      freshwater: { morning: 120, refilled: 0, evening: 105, consumption: 15 },
      fuel: { morning: 85, refilled: 0, evening: 78, consumption: 7 },
      events: [
        {
          time: '10:15',
          mgk: '042',
          rwk: '038',
          windDirection: isDe ? 'NW' : 'NW',
          windStrength: '4 Bft',
          seaState: isDe ? 'leicht bewegt' : 'slight',
          sailsOrMotor: isDe ? 'Großsegel + Genua' : 'Mainsail + Genoa',
          remarks: isDe ? 'Abfahrt Kiellinie' : 'Departure Kiellinie'
        },
        {
          time: '11:20',
          mgk: '030',
          rwk: '028',
          windDirection: 'N',
          windStrength: '3 Bft',
          seaState: isDe ? 'ruhig' : 'calm',
          sailsOrMotor: isDe ? 'Großsegel + Genua' : 'Mainsail + Genoa',
          remarks: isDe ? 'Ankunft Laboe' : 'Arrival Laboe'
        }
      ]
    },
    {
      date: '2026-05-30',
      dayOfTravel: '2',
      departure: 'Laboe',
      destination: 'Damp',
      gpx: laboeDampGpx,
      filename: 'laboe-damp.gpx',
      freshwater: { morning: 105, refilled: 25, evening: 110, consumption: 20 },
      fuel: { morning: 78, refilled: 0, evening: 70, consumption: 8 },
      events: [
        {
          time: '09:00',
          mgk: '055',
          rwk: '050',
          windDirection: 'NE',
          windStrength: '3 Bft',
          seaState: isDe ? 'leicht bewegt' : 'slight',
          sailsOrMotor: isDe ? 'Großsegel + Genua' : 'Mainsail + Genoa',
          remarks: isDe ? 'Auslaufen aus Laboe' : 'Departing Laboe'
        },
        {
          time: '12:30',
          mgk: '075',
          rwk: '068',
          windDirection: 'E',
          windStrength: '4 Bft',
          seaState: isDe ? 'mäßig bewegt' : 'moderate',
          sailsOrMotor: isDe ? 'Großsegel + Genua' : 'Mainsail + Genoa',
          remarks: isDe ? 'Kurs entlang der Küste' : 'Coastal passage'
        }
      ]
    },
    {
      date: '2026-05-31',
      dayOfTravel: '3',
      departure: 'Damp',
      destination: isDe ? 'Schleimünde' : 'Schleimünde',
      gpx: dampSchleimuendeGpx,
      filename: 'damp-schleimuende.gpx',
      freshwater: { morning: 110, refilled: 0, evening: 95, consumption: 15 },
      fuel: { morning: 70, refilled: 15, evening: 80, consumption: 5 },
      events: [
        {
          time: '08:30',
          mgk: '290',
          rwk: '285',
          windDirection: 'W',
          windStrength: '4 Bft',
          seaState: isDe ? 'mäßig bewegt' : 'moderate',
          sailsOrMotor: isDe ? 'Großsegel + Genua' : 'Mainsail + Genoa',
          remarks: isDe ? 'Passage zur Schlei' : 'Passage toward Schlei'
        },
        {
          time: '14:00',
          mgk: '310',
          rwk: '305',
          windDirection: 'NW',
          windStrength: '3 Bft',
          seaState: isDe ? 'leicht bewegt' : 'slight',
          sailsOrMotor: isDe ? 'Großsegel + Genua' : 'Mainsail + Genoa',
          remarks: isDe ? 'Ziel Schleimünde' : 'Destination Schleimünde'
        }
      ]
    }
  ]
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
  const isDe = i18n.language.startsWith('de')
  const yachtData = {
    name: isDe ? 'Seeadler' : 'Seeadler',
    vesselType: isDe ? 'Segelyacht' : 'Sailing yacht',
    lengthM: 12.5,
    draftM: 1.9,
    airDraftM: 18,
    homePort: 'Kiel',
    charterCompany: '',
    owner: isDe ? 'Demo Skipper' : 'Demo Skipper',
    registrationNumber: 'D-KI 1234',
    callSign: 'DA1234',
    atis: '',
    mmsi: '',
    sails: isDe
      ? ['Großsegel', 'Genua', 'Spinnaker']
      : ['Mainsail', 'Genoa', 'Spinnaker'],
    photo: null
  }

  await putEncryptedRecord(logbookId, key, 'yacht', logbookId, yachtData, now)

  const crewId = crypto.randomUUID()
  const crewData = {
    name: isDe ? 'Anna Müller' : 'Anna Müller',
    address: isDe ? 'Hafenstraße 1, 24103 Kiel' : 'Harbour St 1, 24103 Kiel',
    birthDate: '1988-04-12',
    phone: '+49 431 123456',
    nationality: isDe ? 'Deutsch' : 'German',
    passportNumber: 'C01X00T47',
    bloodType: 'A+',
    allergies: '',
    diseases: '',
    role: 'crew',
    photo: null
  }

  await putEncryptedRecord(logbookId, key, 'crew', crewId, crewData, now)
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

  const days = buildDemoDays()
  let firstEntryId = ''

  for (const day of days) {
    const entryId = crypto.randomUUID()
    if (!firstEntryId) firstEntryId = entryId

    const { waypoints } = parseTrackFile(day.gpx, day.filename)
    const stats = computeTrackStats(waypoints)

    const entryPayload: Record<string, unknown> = {
      date: day.date,
      dayOfTravel: day.dayOfTravel,
      departure: day.departure,
      destination: day.destination,
      freshwater: { ...day.freshwater },
      fuel: { ...day.fuel },
      signSkipper: '',
      signCrew: '',
      events: day.events
    }

    if (stats) {
      entryPayload.trackDistanceNm = stats.distanceNm
      entryPayload.trackSpeedMaxKn = stats.speedMaxKn
      entryPayload.trackSpeedAvgKn = stats.speedAvgKn
    }

    await putEncryptedRecord(logbookId, key, 'entry', entryId, entryPayload, now)

    const trackData = {
      waypoints,
      gpxContent: day.gpx,
      filename: day.filename,
      fileType: 'gpx'
    }
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
