import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  forcePwaRecovery,
  markReloadAttempt,
  recentlyAttemptedReload,
  reconcileServiceWorkerOnStartup,
  reconcileVersionOnStartup
} from './pwaStartup.js'

const STALE_RECOVERY_COUNT_KEY = 'pwa_stale_recovery_count'
const STALE_RECOVERY_LAST_KEY = 'pwa_stale_recovery_last_ts'

describe('pwaStartup reload guards', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('blocks repeated reload attempts within the debounce window', () => {
    expect(recentlyAttemptedReload(10_000)).toBe(false)
    markReloadAttempt(10_000)
    expect(recentlyAttemptedReload(12_000)).toBe(true)
    expect(recentlyAttemptedReload(15_000)).toBe(false)
  })
})

describe('forcePwaRecovery stale counter reset', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('clears stale recovery counter before hard recovery reload', async () => {
    vi.stubEnv('DEV', false)
    sessionStorage.setItem(STALE_RECOVERY_COUNT_KEY, '2')
    sessionStorage.setItem(STALE_RECOVERY_LAST_KEY, String(Date.now()))

    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn()
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([])
      }
    })

    await forcePwaRecovery()

    expect(sessionStorage.getItem(STALE_RECOVERY_COUNT_KEY)).toBeNull()
    expect(sessionStorage.getItem(STALE_RECOVERY_LAST_KEY)).toBeNull()
    expect(reload).toHaveBeenCalledOnce()
  })
})

describe('reconcileServiceWorkerOnStartup', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.unstubAllEnvs()
  })

  it('returns false in dev mode', async () => {
    vi.stubEnv('DEV', true)
    await expect(reconcileServiceWorkerOnStartup()).resolves.toBe(false)
  })

  it('returns false when no waiting worker exists', async () => {
    vi.stubEnv('DEV', false)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        getRegistration: vi.fn().mockResolvedValue({
          waiting: null,
          installing: null,
          update: vi.fn().mockResolvedValue(undefined),
          addEventListener: vi.fn()
        }),
        addEventListener: vi.fn()
      }
    })

    await expect(reconcileServiceWorkerOnStartup()).resolves.toBe(false)
  })
})

describe('reconcileVersionOnStartup', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns noop in dev mode', async () => {
    vi.stubEnv('DEV', true)
    await expect(reconcileVersionOnStartup()).resolves.toBe('noop')
  })

  it('returns noop when deployed version matches bundled version', async () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '0.1.0.57' })
    }))
    vi.stubGlobal('__APP_VERSION__', '0.1.0.57')

    await expect(reconcileVersionOnStartup()).resolves.toBe('noop')
  })
})
