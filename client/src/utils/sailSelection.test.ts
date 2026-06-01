import { describe, expect, it } from 'vitest'
import {
  dedupeSailNames,
  isSailInSelection,
  joinSailSelection,
  splitSailSelection,
  toggleSailInSelection
} from './sailSelection.js'

describe('toggleSailInSelection', () => {
  it('adds a second sail without removing the first', () => {
    const first = toggleSailInSelection([], 'Mainsail')
    expect(first).toEqual(['Mainsail'])
    const second = toggleSailInSelection(first, 'Genoa')
    expect(second).toEqual(['Mainsail', 'Genoa'])
  })

  it('removes sail when toggled again', () => {
    const selected = toggleSailInSelection(
      toggleSailInSelection([], 'Mainsail'),
      'Genoa'
    )
    expect(toggleSailInSelection(selected, 'Mainsail')).toEqual(['Genoa'])
  })

  it('matches case-insensitively', () => {
    expect(toggleSailInSelection(['genua'], 'Genua')).toEqual([])
    expect(isSailInSelection(['Großsegel'], 'großsegel')).toBe(true)
  })
})

describe('joinSailSelection / splitSailSelection', () => {
  it('round-trips multiple sails', () => {
    const joined = joinSailSelection(['Großsegel', 'Genua'])
    expect(joined).toBe('Großsegel + Genua')
    expect(splitSailSelection(joined)).toEqual(['Großsegel', 'Genua'])
  })
})

describe('dedupeSailNames', () => {
  it('removes duplicate names', () => {
    expect(dedupeSailNames(['Genua', 'genua', 'Fock'])).toEqual(['Genua', 'Fock'])
  })
})
