import { describe, expect, it } from 'vitest'
import {
  clampTankLiters,
  extractTankCapacitiesFromYacht,
  formatTankLitersForInput,
  parseOptionalTankLiters,
  tankCapacityInputFromStored
} from './tankCapacity.js'

describe('tankCapacity', () => {
  it('parses optional liters with comma decimal', () => {
    expect(parseOptionalTankLiters('200')).toBe(200)
    expect(parseOptionalTankLiters('12,5')).toBe(12.5)
    expect(parseOptionalTankLiters('')).toBeUndefined()
  })

  it('rejects negative or invalid liters', () => {
    expect(() => parseOptionalTankLiters('-1')).toThrow('invalid_tank_liters')
    expect(() => parseOptionalTankLiters('abc')).toThrow('invalid_tank_liters')
  })

  it('extracts capacities from yacht payload', () => {
    expect(
      extractTankCapacitiesFromYacht({
        freshwaterCapacityL: 300,
        fuelCapacityL: 120,
        greywaterCapacityL: 80
      })
    ).toEqual({
      freshwaterCapacityL: 300,
      fuelCapacityL: 120,
      greywaterCapacityL: 80
    })
    expect(extractTankCapacitiesFromYacht({ name: 'Test' })).toEqual({})
  })

  it('formats stored capacity for input', () => {
    expect(tankCapacityInputFromStored(150)).toBe('150')
    expect(formatTankLitersForInput(12.5)).toBe('12.5')
  })

  it('clamps liters to max when set', () => {
    expect(clampTankLiters(250, 200)).toBe(200)
    expect(clampTankLiters(-5, 200)).toBe(0)
    expect(clampTankLiters(50)).toBe(50)
  })
})
