import { describe, expect, it } from 'vitest'
import {
  cardinalToDegrees,
  degreesToCardinal,
  formatCourseAngle,
  isCardinalDirection,
  normalizeCourseAngleString,
  normalizeWindDirectionString,
  parseCourseAngle,
  pointerAngleToDegrees,
  snapDegrees
} from './courseAngle.js'

describe('parseCourseAngle', () => {
  it('parses padded and plain degrees', () => {
    expect(parseCourseAngle('042')).toBe(42)
    expect(parseCourseAngle('185°')).toBe(185)
    expect(parseCourseAngle('360')).toBe(0)
  })

  it('rejects invalid values', () => {
    expect(parseCourseAngle('999')).toBeNull()
    expect(parseCourseAngle('abc')).toBeNull()
  })

  it('parses cardinal labels', () => {
    expect(parseCourseAngle('NW')).toBe(315)
  })
})

describe('snapDegrees', () => {
  it('snaps to step', () => {
    expect(snapDegrees(47, 5)).toBe(45)
    expect(snapDegrees(358, 5)).toBe(0)
  })
})

describe('cardinal helpers', () => {
  it('roundtrips cardinal through degrees', () => {
    expect(degreesToCardinal(225)).toBe('SW')
    expect(cardinalToDegrees('SW')).toBe(225)
    expect(isCardinalDirection('nne')).toBe(true)
  })
})

describe('pointerAngleToDegrees', () => {
  it('returns 0 for north', () => {
    expect(pointerAngleToDegrees(100, 50, 100, 100)).toBe(0)
  })

  it('returns 90 for east', () => {
    expect(Math.round(pointerAngleToDegrees(150, 100, 100, 100))).toBe(90)
  })
})

describe('normalizeCourseAngleString', () => {
  it('keeps empty when allowed', () => {
    expect(normalizeCourseAngleString('', { allowEmpty: true })).toBe('')
  })

  it('normalizes numeric course', () => {
    expect(normalizeCourseAngleString('042')).toBe('42')
    expect(formatCourseAngle(42, true)).toBe('042')
  })
})

describe('normalizeWindDirectionString', () => {
  it('preserves cardinal wind', () => {
    expect(normalizeWindDirectionString('nw')).toBe('NW')
  })

  it('normalizes degree wind', () => {
    expect(normalizeWindDirectionString('090')).toBe('90')
  })
})
