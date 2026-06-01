import type { LogbookVesselSelectionData, VesselData, VesselSnapshot } from '../types/vessel.js'

export function vesselToSnapshot(id: string, data: VesselData): VesselSnapshot {
  return {
    id,
    name: data.name,
    vesselType: data.vesselType,
    lengthM: data.lengthM,
    draftM: data.draftM,
    airDraftM: data.airDraftM,
    homePort: data.homePort,
    charterCompany: data.charterCompany,
    owner: data.owner,
    registrationNumber: data.registrationNumber,
    callSign: data.callSign,
    atis: data.atis,
    mmsi: data.mmsi,
    sails: data.sails ? [...data.sails] : [],
    photo: data.photo ?? null,
    freshwaterCapacityL: data.freshwaterCapacityL,
    fuelCapacityL: data.fuelCapacityL,
    greywaterCapacityL: data.greywaterCapacityL
  }
}

export function buildLogbookVesselSelection(
  activeVesselId: string | null,
  pool: Map<string, VesselData>
): LogbookVesselSelectionData {
  if (!activeVesselId) {
    return { activeVesselId: null, vesselSnapshot: null }
  }
  const data = pool.get(activeVesselId)
  if (!data) {
    return { activeVesselId, vesselSnapshot: null }
  }
  return {
    activeVesselId,
    vesselSnapshot: vesselToSnapshot(activeVesselId, data)
  }
}

export function vesselDataFromSnapshot(snapshot: VesselSnapshot | null): VesselData | null {
  if (!snapshot) return null
  const { id: _id, ...data } = snapshot
  return data
}
