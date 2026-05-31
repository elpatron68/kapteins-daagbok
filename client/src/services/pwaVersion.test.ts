import { describe, expect, it } from 'vitest'
import {
  compareAppVersions,
  isNewerAppVersion,
  parseAppVersion
} from './pwaVersion.js'

describe('pwaVersion', () => {
  it('parses semantic build versions', () => {
    expect(parseAppVersion('v0.1.0.57')).toEqual([0, 1, 0, 57])
  })

  it('compares build numbers numerically', () => {
    expect(compareAppVersions('0.1.0.65', '0.1.0.57')).toBeGreaterThan(0)
    expect(compareAppVersions('0.1.0.57', '0.1.0.65')).toBeLessThan(0)
    expect(compareAppVersions('0.1.0.57', '0.1.0.57')).toBe(0)
  })

  it('detects newer deployed versions', () => {
    expect(isNewerAppVersion('0.1.0.66', '0.1.0.57')).toBe(true)
    expect(isNewerAppVersion('0.1.0.57', '0.1.0.57')).toBe(false)
  })
})
