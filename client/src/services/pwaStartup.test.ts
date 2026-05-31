import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  markReloadAttempt,
  recentlyAttemptedReload,
  reconcileServiceWorkerOnStartup,
  reconcileVersionOnStartup
} from './pwaStartup.js'

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
