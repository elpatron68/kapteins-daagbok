import { prisma } from '../db.js'

/** Prisma client includes delegates only after `npx prisma generate` on the current schema. */
export function hasCrewPoolPrismaModels(): boolean {
  const client = prisma as unknown as {
    personPayload?: { findMany: unknown }
    logbookCrewSelectionPayload?: { findUnique: unknown }
  }
  return (
    typeof client.personPayload?.findMany === 'function' &&
    typeof client.logbookCrewSelectionPayload?.findUnique === 'function'
  )
}

export function hasVesselPoolPrismaModels(): boolean {
  const client = prisma as unknown as {
    vesselPayload?: { findMany: unknown }
    logbookVesselSelectionPayload?: { findUnique: unknown }
  }
  return (
    typeof client.vesselPayload?.findMany === 'function' &&
    typeof client.logbookVesselSelectionPayload?.findUnique === 'function'
  )
}

export const CREW_POOL_MIGRATION_HINT =
  'Crew-Pool-Datenbank fehlt. Im Ordner server ausführen: npx prisma generate && npx prisma db push — danach Server neu starten.'

export const VESSEL_POOL_MIGRATION_HINT =
  'Schiffs-Pool-Datenbank fehlt. Im Ordner server ausführen: npx prisma generate && npx prisma db push — danach Server neu starten.'

export function isMissingPrismaTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2021'
  )
}
