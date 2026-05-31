import { describe, expect, it } from 'vitest'
import {
  hasUnsavedEventDraft,
  isLogEventDraftEmpty,
  normalizeLogEvent,
  type LogEventPayload
} from './logEntryPayload.js'

const emptyDraft = (): LogEventPayload =>
  normalizeLogEvent({ time: '12:34' })

const filledDraft = (): LogEventPayload =>
  normalizeLogEvent({ time: '12:34', remarks: 'Wind dreht' })

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
