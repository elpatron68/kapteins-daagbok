import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDemoLogbookRefs,
  getDemoFirstEntryStorageKey,
  getDemoLogbookStorageKey
} from './demoLogbook.js'

describe('clearDemoLogbookRefs', () => {
  const userId = 'user-1'

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('active_userid', userId)
  })

  it('removes demo logbook and first-entry keys for the user', () => {
    const logbookId = 'lb-demo'
    localStorage.setItem(getDemoLogbookStorageKey(userId), logbookId)
    localStorage.setItem(getDemoFirstEntryStorageKey(userId), 'entry-1')

    clearDemoLogbookRefs(userId, logbookId)

    expect(localStorage.getItem(getDemoLogbookStorageKey(userId))).toBeNull()
    expect(localStorage.getItem(getDemoFirstEntryStorageKey(userId))).toBeNull()
  })

  it('does not clear refs when logbookId does not match stored demo id', () => {
    localStorage.setItem(getDemoLogbookStorageKey(userId), 'other-logbook')
    localStorage.setItem(getDemoFirstEntryStorageKey(userId), 'entry-1')

    clearDemoLogbookRefs(userId, 'deleted-logbook')

    expect(localStorage.getItem(getDemoLogbookStorageKey(userId))).toBe('other-logbook')
    expect(localStorage.getItem(getDemoFirstEntryStorageKey(userId))).toBe('entry-1')
  })
})
