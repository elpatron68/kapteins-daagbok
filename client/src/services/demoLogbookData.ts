import { parseTrackFile } from './trackUpload.js'
import { computeTrackStats } from '../utils/trackStats.js'
import i18n from '../i18n/index.js'

import kielLaboeGpx from '../assets/demo/kiel-laboe.gpx?raw'
import laboeDampGpx from '../assets/demo/laboe-damp.gpx?raw'
import dampSchleimuendeGpx from '../assets/demo/damp-schleimuende.gpx?raw'

/** Stable ID for the first demo travel day (public demo tour highlight). */
export const PUBLIC_DEMO_FIRST_ENTRY_ID = 'a0000001-0000-4000-8000-000000000001'

const PUBLIC_DEMO_ENTRY_IDS = [
  PUBLIC_DEMO_FIRST_ENTRY_ID,
  'a0000001-0000-4000-8000-000000000002',
  'a0000001-0000-4000-8000-000000000003'
] as const

const PUBLIC_DEMO_CREW_MEMBER_ID = 'a0000001-0000-4000-8000-000000000010'

export interface DemoDaySpec {
  date: string
  dayOfTravel: string
  departure: string
  destination: string
  gpx: string
  filename: string
  freshwater: { morning: number; refilled: number; evening: number; consumption: number }
  fuel: { morning: number; refilled: number; evening: number; consumption: number }
  greywaterLevel?: number
  motorHours?: number
  events: Array<Record<string, string>>
}

export interface DemoCrewRecord {
  payloadId: string
  data: {
    name: string
    address: string
    birthDate: string
    phone: string
    nationality: string
    passportNumber: string
    bloodType: string
    allergies: string
    diseases: string
    role: 'skipper' | 'crew'
    photo: string | null
  }
}

export interface PublicDemoFixture {
  title: string
  yacht: Record<string, unknown>
  crews: DemoCrewRecord[]
  entries: Array<Record<string, unknown> & { payloadId: string }>
  gpsTracks: Array<{ entryId: string; waypoints: unknown[]; filename: string; gpxContent?: string; fileType: string }>
  photos: never[]
  firstEntryId: string
}

export function buildDemoDays(): DemoDaySpec[] {
  const isDe = i18n.language.startsWith('de')
  return [
    {
      date: '2026-05-29',
      dayOfTravel: '1',
      departure: 'Kiel',
      destination: 'Laboe',
      gpx: kielLaboeGpx,
      filename: 'kiel-laboe.gpx',
      freshwater: { morning: 120, refilled: 0, evening: 105, consumption: 15 },
      fuel: { morning: 85, refilled: 0, evening: 78, consumption: 7 },
      greywaterLevel: 25,
      events: [
        {
          time: '10:15',
          mgk: '042',
          rwk: '038',
          windDirection: 'NW',
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
      greywaterLevel: 38,
      motorHours: 1.5,
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
      destination: 'Schleimünde',
      gpx: dampSchleimuendeGpx,
      filename: 'damp-schleimuende.gpx',
      freshwater: { morning: 110, refilled: 0, evening: 95, consumption: 15 },
      fuel: { morning: 70, refilled: 15, evening: 80, consumption: 5 },
      greywaterLevel: 52,
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

export function buildDemoYachtData(): Record<string, unknown> {
  const isDe = i18n.language.startsWith('de')
  return {
    name: 'Seeadler',
    vesselType: isDe ? 'Segelyacht' : 'Sailing yacht',
    lengthM: 12.5,
    draftM: 1.9,
    airDraftM: 18,
    homePort: 'Kiel',
    charterCompany: '',
    owner: 'Demo Skipper',
    registrationNumber: 'D-KI 1234',
    callSign: 'DA1234',
    atis: '',
    mmsi: '',
    sails: isDe ? ['Großsegel', 'Genua', 'Spinnaker'] : ['Mainsail', 'Genoa', 'Spinnaker'],
    photo: null,
    freshwaterCapacityL: 200,
    fuelCapacityL: 100,
    greywaterCapacityL: 80
  }
}

export function buildDemoCrewRecords(): DemoCrewRecord[] {
  const isDe = i18n.language.startsWith('de')
  return [
    {
      payloadId: 'skipper',
      data: {
        name: 'Demo Skipper',
        address: isDe ? 'Am Hafen 12, 24103 Kiel' : 'Harbour Quay 12, 24103 Kiel',
        birthDate: '1980-06-15',
        phone: '+49 431 987654',
        nationality: isDe ? 'Deutsch' : 'German',
        passportNumber: 'C12X34Y56',
        bloodType: '0+',
        allergies: '',
        diseases: '',
        role: 'skipper',
        photo: null
      }
    },
    {
      payloadId: PUBLIC_DEMO_CREW_MEMBER_ID,
      data: {
        name: 'Anna Müller',
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
    }
  ]
}

export function buildPublicDemoFixture(): PublicDemoFixture {
  const title = i18n.t('demo.logbook_title')
  const yacht = buildDemoYachtData()
  const crews = buildDemoCrewRecords()
  const days = buildDemoDays()
  const entries: PublicDemoFixture['entries'] = []
  const gpsTracks: PublicDemoFixture['gpsTracks'] = []

  days.forEach((day, index) => {
    const entryId = PUBLIC_DEMO_ENTRY_IDS[index] ?? crypto.randomUUID()
    const { waypoints } = parseTrackFile(day.gpx, day.filename)
    const stats = computeTrackStats(waypoints)

    const entryPayload: Record<string, unknown> = {
      payloadId: entryId,
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

    if (day.greywaterLevel != null && day.greywaterLevel > 0) {
      entryPayload.greywater = { level: day.greywaterLevel }
    }

    if (stats) {
      entryPayload.trackDistanceNm = stats.distanceNm
      entryPayload.trackSpeedMaxKn = stats.speedMaxKn
      entryPayload.trackSpeedAvgKn = stats.speedAvgKn
    }
    if (day.motorHours != null && day.motorHours > 0) {
      entryPayload.motorHours = day.motorHours
    }

    entries.push(entryPayload as PublicDemoFixture['entries'][number])

    gpsTracks.push({
      entryId,
      waypoints,
      filename: day.filename,
      gpxContent: day.gpx,
      fileType: 'gpx'
    })
  })

  return {
    title,
    yacht,
    crews,
    entries,
    gpsTracks,
    photos: [],
    firstEntryId: PUBLIC_DEMO_FIRST_ENTRY_ID
  }
}

export function getPublicDemoFirstEntryId(): string {
  return PUBLIC_DEMO_FIRST_ENTRY_ID
}

/** Payloads for encrypted seeding (without payloadId on entries). */
export function buildDemoEntryPayloads(): Array<{
  entryId: string
  entryPayload: Record<string, unknown>
  trackData: { waypoints: unknown[]; gpxContent: string; filename: string; fileType: string }
}> {
  const days = buildDemoDays()
  return days.map((day) => {
    const entryId = crypto.randomUUID()
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

    if (day.greywaterLevel != null && day.greywaterLevel > 0) {
      entryPayload.greywater = { level: day.greywaterLevel }
    }

    if (stats) {
      entryPayload.trackDistanceNm = stats.distanceNm
      entryPayload.trackSpeedMaxKn = stats.speedMaxKn
      entryPayload.trackSpeedAvgKn = stats.speedAvgKn
    }
    if (day.motorHours != null && day.motorHours > 0) {
      entryPayload.motorHours = day.motorHours
    }

    return {
      entryId,
      entryPayload,
      trackData: {
        waypoints,
        gpxContent: day.gpx,
        filename: day.filename,
        fileType: 'gpx'
      }
    }
  })
}
