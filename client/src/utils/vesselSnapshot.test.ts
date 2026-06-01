import { describe, expect, it } from 'vitest'
import { buildLogbookVesselSelection, vesselDataFromSnapshot, vesselToSnapshot } from './vesselSnapshot.js'
import type { VesselData } from '../types/vessel.js'

const sampleVessel: VesselData = {
  name: 'Sea Breeze',
  homePort: 'Kiel',
  sails: ['Genoa'],
  registrationNumber: 'DE-123'
}

describe('vesselSnapshot', () => {
  it('builds selection with snapshot from pool', () => {
    const pool = new Map<string, VesselData>([['v1', sampleVessel]])
    const sel = buildLogbookVesselSelection('v1', pool)
    expect(sel.activeVesselId).toBe('v1')
    expect(sel.vesselSnapshot?.name).toBe('Sea Breeze')
    expect(sel.vesselSnapshot?.id).toBe('v1')
  })

  it('returns empty selection when no vessel id', () => {
    const sel = buildLogbookVesselSelection(null, new Map())
    expect(sel.activeVesselId).toBeNull()
    expect(sel.vesselSnapshot).toBeNull()
  })

  it('round-trips snapshot to vessel data', () => {
    const snap = vesselToSnapshot('v1', sampleVessel)
    const data = vesselDataFromSnapshot(snap)
    expect(data?.name).toBe('Sea Breeze')
    expect(data?.homePort).toBe('Kiel')
  })
})
