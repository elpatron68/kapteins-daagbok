import { parseOptionalTankLiters, tankCapacityInputFromStored } from './tankCapacity.js'
import { formatAppDecimal, parseAppDecimal } from './numberFormat.js'
import type { VesselData } from '../types/vessel.js'

export function metricInputFromStored(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatAppDecimal(value, { maximumFractionDigits: 6 })
  }
  if (typeof value === 'string') return value.trim()
  return ''
}

export function parseOptionalMetricMeters(input: string): number | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const parsed = parseAppDecimal(trimmed)
  if (parsed == null || parsed < 0) {
    throw new Error('invalid_metric')
  }
  return parsed
}

export interface VesselFormInputs {
  name: string
  vesselType: string
  lengthM: string
  draftM: string
  airDraftM: string
  homePort: string
  charterCompany: string
  owner: string
  registrationNumber: string
  callSign: string
  atis: string
  mmsi: string
  sails: string[]
  photo: string | null
  freshwaterCapacityL: string
  fuelCapacityL: string
  greywaterCapacityL: string
}

export function vesselDataToFormInputs(data: Partial<VesselData>): VesselFormInputs {
  return {
    name: data.name || '',
    vesselType: data.vesselType || '',
    lengthM: metricInputFromStored(data.lengthM),
    draftM: metricInputFromStored(data.draftM),
    airDraftM: metricInputFromStored(data.airDraftM),
    homePort: data.homePort || '',
    charterCompany: data.charterCompany || '',
    owner: data.owner || '',
    registrationNumber: data.registrationNumber || '',
    callSign: data.callSign || '',
    atis: data.atis || '',
    mmsi: data.mmsi || '',
    sails: data.sails || [],
    photo: data.photo ?? null,
    freshwaterCapacityL: tankCapacityInputFromStored(data.freshwaterCapacityL),
    fuelCapacityL: tankCapacityInputFromStored(data.fuelCapacityL),
    greywaterCapacityL: tankCapacityInputFromStored(data.greywaterCapacityL)
  }
}

export function parseVesselFormInputs(inputs: VesselFormInputs): VesselData {
  const parsedLengthM = parseOptionalMetricMeters(inputs.lengthM)
  const parsedDraftM = parseOptionalMetricMeters(inputs.draftM)
  const parsedAirDraftM = parseOptionalMetricMeters(inputs.airDraftM)
  const parsedFreshwaterCapacityL = parseOptionalTankLiters(inputs.freshwaterCapacityL)
  const parsedFuelCapacityL = parseOptionalTankLiters(inputs.fuelCapacityL)
  const parsedGreywaterCapacityL = parseOptionalTankLiters(inputs.greywaterCapacityL)

  return {
    name: inputs.name.trim(),
    vesselType: inputs.vesselType || undefined,
    lengthM: parsedLengthM,
    draftM: parsedDraftM,
    airDraftM: parsedAirDraftM,
    freshwaterCapacityL: parsedFreshwaterCapacityL,
    fuelCapacityL: parsedFuelCapacityL,
    greywaterCapacityL: parsedGreywaterCapacityL,
    homePort: inputs.homePort.trim(),
    charterCompany: inputs.charterCompany.trim(),
    owner: inputs.owner.trim(),
    registrationNumber: inputs.registrationNumber.trim(),
    callSign: inputs.callSign.trim(),
    atis: inputs.atis.trim(),
    mmsi: inputs.mmsi.trim(),
    sails: inputs.sails,
    photo: inputs.photo
  }
}
