import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasUnlockedLocalCrypto,
  hasUnlockedLocalSession,
  setActiveMasterKey
} from './auth.js'

describe('local session unlock checks', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveMasterKey(null)
  })

  it('hasUnlockedLocalCrypto with master key and username only', () => {
    setActiveMasterKey(new ArrayBuffer(32))
    localStorage.setItem('active_username', 'skipper')
    expect(hasUnlockedLocalCrypto()).toBe(true)
    expect(hasUnlockedLocalSession()).toBe(false)
  })

  it('hasUnlockedLocalSession when userId is present', () => {
    setActiveMasterKey(new ArrayBuffer(32))
    localStorage.setItem('active_username', 'skipper')
    localStorage.setItem('active_userid', 'user-1')
    expect(hasUnlockedLocalCrypto()).toBe(true)
    expect(hasUnlockedLocalSession()).toBe(true)
  })

  it('hasUnlockedLocalCrypto false without master key', () => {
    localStorage.setItem('active_username', 'skipper')
    localStorage.setItem('active_userid', 'user-1')
    expect(hasUnlockedLocalCrypto()).toBe(false)
  })
})
