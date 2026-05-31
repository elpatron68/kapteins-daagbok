import { describe, expect, it } from 'vitest'
import {
  carryOverFromPreviousDay,
  getClosingGreywaterLevel,
  hasCarryOverFromPreviousDay
} from './logEntryTankLevels.js'

describe('logEntryTankLevels greywater carry-over', () => {
  it('returns previous greywater level as starting value', () => {
    const carryOver = carryOverFromPreviousDay({
      destination: 'Oslo',
      freshwater: { morning: 100, refilled: 0, evening: 80, consumption: 20 },
      fuel: { morning: 200, refilled: 0, evening: 150, consumption: 50 },
      greywater: { level: 42 }
    })

    expect(carryOver.greywaterLevel).toBe(42)
    expect(carryOver.freshwater.morning).toBe(80)
    expect(carryOver.fuel.morning).toBe(150)
    expect(carryOver.departure).toBe('Oslo')
  })

  it('defaults greywater to 0 when previous day has none', () => {
    expect(carryOverFromPreviousDay(null).greywaterLevel).toBe(0)
    expect(getClosingGreywaterLevel(undefined)).toBe(0)
  })

  it('treats greywater level as carry-over candidate', () => {
    expect(
      hasCarryOverFromPreviousDay({
        freshwater: { morning: 0, refilled: 0, evening: 0, consumption: 0 },
        fuel: { morning: 0, refilled: 0, evening: 0, consumption: 0 },
        greywaterLevel: 15,
        departure: ''
      })
    ).toBe(true)
  })
})
