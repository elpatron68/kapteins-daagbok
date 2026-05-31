import { db } from './db.js'
import { getActiveMasterKey } from './auth.js'
import { getLogbookKey } from './logbookKeys.js'
import { decryptJson } from './crypto.js'
import { compareTravelDaysChronological } from '../utils/logEntryTankLevels.js'
import type { LogEventPayload } from '../utils/logEntryPayload.js'
import { LIVE_EVENT_CODES } from '../utils/liveEventCodes.js'

export interface EventSeriesPoint {
  entryId: string
  date: string
  dayOfTravel: string
  time: string
  summary: string
}

export interface EventSeriesSummary {
  pressure: EventSeriesPoint[]
  wind: EventSeriesPoint[]
  motor: EventSeriesPoint[]
}

function sortPoints(points: EventSeriesPoint[]): EventSeriesPoint[] {
  return [...points].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date)
    if (dateCompare !== 0) return dateCompare
    return a.time.localeCompare(b.time)
  })
}

export async function loadLogbookEventSeries(logbookId: string): Promise<EventSeriesSummary> {
  const masterKey = await getLogbookKey(logbookId) || getActiveMasterKey()
  if (!masterKey) throw new Error('Encryption key not found. Please log in.')

  const local = await db.entries.where({ logbookId }).toArray()
  const decryptedEntries: Array<{
    entryId: string
    date: string
    dayOfTravel: string
    events: LogEventPayload[]
  }> = []

  for (const entry of local) {
    const decrypted = await decryptJson(entry.encryptedData, entry.iv, entry.tag, masterKey)
    if (!decrypted) continue
    decryptedEntries.push({
      entryId: entry.payloadId,
      date: String(decrypted.date || ''),
      dayOfTravel: String(decrypted.dayOfTravel || ''),
      events: (decrypted.events as LogEventPayload[]) || []
    })
  }

  decryptedEntries.sort((a, b) =>
    compareTravelDaysChronological(
      { date: a.date, dayOfTravel: a.dayOfTravel },
      { date: b.date, dayOfTravel: b.dayOfTravel }
    )
  )

  const pressure: EventSeriesPoint[] = []
  const wind: EventSeriesPoint[] = []
  const motor: EventSeriesPoint[] = []

  for (const entry of decryptedEntries) {
    for (const event of entry.events) {
      const base = {
        entryId: entry.entryId,
        date: entry.date,
        dayOfTravel: entry.dayOfTravel,
        time: event.time
      }

      if (event.windPressure.trim()) {
        pressure.push({
          ...base,
          summary: `${event.windPressure} hPa`
        })
      }

      if (event.windDirection.trim() || event.windStrength.trim()) {
        wind.push({
          ...base,
          summary: [event.windDirection, event.windStrength].filter(Boolean).join(' ')
        })
      }

      const code = event.remarks.trim()
      if (
        code === LIVE_EVENT_CODES.MOTOR_START ||
        code === LIVE_EVENT_CODES.MOTOR_STOP
      ) {
        motor.push({
          ...base,
          summary: code === LIVE_EVENT_CODES.MOTOR_START ? 'start' : 'stop'
        })
      }
    }
  }

  return {
    pressure: sortPoints(pressure),
    wind: sortPoints(wind),
    motor: sortPoints(motor)
  }
}
