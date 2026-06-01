export interface VesselData {
  name: string
  vesselType?: string
  lengthM?: number
  draftM?: number
  airDraftM?: number
  homePort?: string
  charterCompany?: string
  owner?: string
  registrationNumber?: string
  callSign?: string
  atis?: string
  mmsi?: string
  sails?: string[]
  photo?: string | null
  freshwaterCapacityL?: number
  fuelCapacityL?: number
  greywaterCapacityL?: number
}

export interface VesselSnapshot extends VesselData {
  id: string
}

export interface LogbookVesselSelectionData {
  activeVesselId: string | null
  /** Denormalized for collaborators / offline without account pool */
  vesselSnapshot: VesselSnapshot | null
}

export const MAX_POOL_VESSELS = 20

export function emptyLogbookVesselSelection(): LogbookVesselSelectionData {
  return {
    activeVesselId: null,
    vesselSnapshot: null
  }
}

export function emptyVesselData(): VesselData {
  return {
    name: '',
    vesselType: '',
    homePort: '',
    charterCompany: '',
    owner: '',
    registrationNumber: '',
    callSign: '',
    atis: '',
    mmsi: '',
    sails: [],
    photo: null
  }
}
