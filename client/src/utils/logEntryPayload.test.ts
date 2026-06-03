import { describe, expect, it } from 'vitest'
import {
  buildLogEntryPayload,
  hasUnsavedEventDraft,
  isLogEventDraftEmpty,
  localDateString,
  normalizeLogEvent,
  type LogEventPayload
} from './logEntryPayload.js'

const emptyDraft = (): LogEventPayload =>
  normalizeLogEvent({ time: '12:34' })

const filledDraft = (): LogEventPayload =>
  normalizeLogEvent({ time: '12:34', remarks: 'Wind dreht' })

describe('localDateString', () => {
  it('uses local calendar date, not UTC', () => {
    const date = new Date(2026, 5, 4, 1, 30, 0)
    expect(localDateString(date)).toBe('2026-06-04')
    expect(date.toISOString().substring(0, 10)).toBe('2026-06-03')
  })
})

describe('logEntryPayload event drafts', () => {
  it('treats time-only draft as empty', () => {
    expect(isLogEventDraftEmpty(emptyDraft())).toBe(true)
  })

  it('detects draft with content', () => {
    expect(isLogEventDraftEmpty(filledDraft())).toBe(false)
  })

  it('does not flag empty open form as unsaved', () => {
    expect(hasUnsavedEventDraft(emptyDraft(), null, [])).toBe(false)
  })

  it('flags new event draft with content as unsaved', () => {
    expect(hasUnsavedEventDraft(filledDraft(), null, [])).toBe(true)
  })

  it('flags edited event when values differ', () => {
    const events = [emptyDraft()]
    const edited = filledDraft()
    expect(hasUnsavedEventDraft(edited, 0, events)).toBe(true)
  })

  it('ignores edit mode when values match', () => {
    const events = [filledDraft()]
    expect(hasUnsavedEventDraft(filledDraft(), 0, events)).toBe(false)
  })
})

describe('buildLogEntryPayload greywater', () => {
  const base = {
    date: '2026-05-31',
    dayOfTravel: '1',
    departure: 'Kiel',
    destination: 'Laboe',
    freshwater: { morning: 0, refilled: 0, evening: 0, consumption: 0 },
    fuel: { morning: 0, refilled: 0, evening: 0, consumption: 0 },
    events: [] as LogEventPayload[]
  }

  it('includes greywater when level > 0', () => {
    const payload = buildLogEntryPayload({ ...base, greywater: { level: 45 } })
    expect(payload.greywater).toEqual({ level: 45 })
  })

  it('omits greywater when level is 0', () => {
    const payload = buildLogEntryPayload({ ...base, greywater: { level: 0 } })
    expect(payload.greywater).toBeUndefined()
  })
})
