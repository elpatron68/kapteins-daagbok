import { Router } from 'express'
import { prisma } from '../db.js'
import { notifyOwnerOfCollaboratorChanges } from '../services/pushNotify.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

router.use(requireUser)

// 1. Push local changes to the server
router.post('/push', async (req: any, res) => {
  try {
    const { items } = req.body
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' })
    }

    const results = []
    const ownerNotifications = new Map<
      string,
      { ownerId: string; logbookId: string; count: number }
    >()

    const recordCollaboratorChange = (
      ownerId: string,
      logbookId: string,
      isOwner: boolean,
      isCollaborator: unknown,
      action: string,
      type: string
    ) => {
      if (isOwner || !isCollaborator) return
      if (action !== 'create' && action !== 'update') return
      if (type === 'logbook') return
      const key = `${ownerId}:${logbookId}`
      const entry = ownerNotifications.get(key) ?? { ownerId, logbookId, count: 0 }
      entry.count += 1
      ownerNotifications.set(key, entry)
    }

    for (const item of items) {
      const { action, type, payloadId, logbookId, data, updatedAt } = item
      const itemUpdatedAt = new Date(updatedAt)

      try {
        // Authorize: Check if logbook belongs to user
        // Exception: If action is create logbook, the logbook might not exist yet,
        // so we authorize based on user creating a logbook with their userId.
        if (type === 'logbook' && (action === 'create' || action === 'update')) {
          const existing = await prisma.logbook.findUnique({
            where: { id: logbookId }
          })
          if (existing && existing.userId !== req.userId) {
            results.push({ payloadId, status: 'error', error: 'Forbidden: Logbook belongs to another user' })
            continue
          }

          const parsed = JSON.parse(data)
          await prisma.logbook.upsert({
            where: { id: logbookId },
            create: {
              id: logbookId,
              userId: req.userId,
              encryptedTitle: parsed.encryptedTitle,
              encryptedKey: parsed.encryptedKey || null,
              iv: parsed.iv || null,
              tag: parsed.tag || null,
              updatedAt: itemUpdatedAt
            },
            update: {
              encryptedTitle: parsed.encryptedTitle,
              ...(parsed.encryptedKey !== undefined ? { encryptedKey: parsed.encryptedKey } : {}),
              ...(parsed.iv !== undefined ? { iv: parsed.iv } : {}),
              ...(parsed.tag !== undefined ? { tag: parsed.tag } : {}),
              updatedAt: itemUpdatedAt
            }
          })
          results.push({ payloadId, status: 'success' })
          continue
        }

        // Standard Authorization: Logbook must exist and belong to user or collaborator
        const logbook = await prisma.logbook.findUnique({
          where: { id: logbookId }
        })

        if (!logbook) {
          results.push({ payloadId, status: 'error', error: 'Logbook not found' })
          continue
        }

        const isOwner = logbook.userId === req.userId
        const collaboration = await prisma.collaboration.findUnique({
          where: {
            logbookId_userId: {
              logbookId,
              userId: req.userId
            }
          }
        })

        if (!isOwner && !collaboration) {
          results.push({ payloadId, status: 'error', error: 'Forbidden: Access denied' })
          continue
        }

        if (!isOwner && (!collaboration || collaboration.role !== 'WRITE')) {
          results.push({ payloadId, status: 'error', error: 'Forbidden: WRITE access required' })
          continue
        }

        if (type === 'logbook' && action === 'delete') {
          if (!isOwner) {
            results.push({ payloadId, status: 'error', error: 'Forbidden: Only owner can delete logbook' })
            continue
          }
          await prisma.logbook.delete({
            where: { id: logbookId }
          })
          results.push({ payloadId, status: 'success' })
          continue
        }

        if (!isOwner && (type === 'yacht' || (type === 'crew' && payloadId === 'skipper'))) {
          results.push({
            payloadId,
            status: 'error',
            error: type === 'yacht'
              ? 'Forbidden: Only owner can modify vessel data'
              : 'Forbidden: Only owner can modify skipper profile'
          })
          continue
        }

        if (action === 'delete') {
          if (type === 'yacht') {
            await prisma.yachtPayload.deleteMany({ where: { logbookId } })
          } else if (type === 'deviation') {
            await prisma.deviationPayload.deleteMany({ where: { logbookId } })
          } else if (type === 'crew') {
            await prisma.crewPayload.deleteMany({ where: { logbookId, payloadId } })
          } else if (type === 'entry') {
            await prisma.entryPayload.deleteMany({ where: { logbookId, payloadId } })
          } else if (type === 'photo') {
            await prisma.photoPayload.deleteMany({ where: { logbookId, payloadId } })
          } else if (type === 'voiceMemo') {
            await prisma.voiceMemoPayload.deleteMany({ where: { logbookId, payloadId } })
          } else if (type === 'gpsTrack') {
            await prisma.gpsTrackPayload.deleteMany({ where: { logbookId, entryId: payloadId } })
          } else if (type === 'logbookCrew') {
            await prisma.logbookCrewSelectionPayload.deleteMany({ where: { logbookId } })
          } else if (type === 'logbookVessel') {
            await prisma.logbookVesselSelectionPayload.deleteMany({ where: { logbookId } })
          } else {
            results.push({ payloadId, status: 'error', error: `Unsupported delete type: ${type}` })
            continue
          }
          results.push({ payloadId, status: 'success' })
          continue
        }

        // Parse payload for create/update operations
        const parsed = JSON.parse(data)
        const encryptedData = parsed.encryptedData || parsed.ciphertext
        const { iv, tag } = parsed

        if (type === 'yacht') {
          {
            const existing = await prisma.yachtPayload.findUnique({ where: { logbookId } })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            await prisma.yachtPayload.upsert({
              where: { logbookId },
              create: { logbookId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'deviation') {
          {
            const existing = await prisma.deviationPayload.findUnique({ where: { logbookId } })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            await prisma.deviationPayload.upsert({
              where: { logbookId },
              create: { logbookId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'crew') {
          {
            const existing = await prisma.crewPayload.findUnique({
              where: { logbookId_payloadId: { logbookId, payloadId } }
            })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            await prisma.crewPayload.upsert({
              where: { logbookId_payloadId: { logbookId, payloadId } },
              create: { logbookId, payloadId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'entry') {
          {
            const existing = await prisma.entryPayload.findUnique({
              where: { logbookId_payloadId: { logbookId, payloadId } }
            })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            await prisma.entryPayload.upsert({
              where: { logbookId_payloadId: { logbookId, payloadId } },
              create: { logbookId, payloadId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'photo') {
          {
            const existing = await prisma.photoPayload.findUnique({
              where: { logbookId_payloadId: { logbookId, payloadId } }
            })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            const entryId = parsed.entryId || ''
            await prisma.photoPayload.upsert({
              where: { logbookId_payloadId: { logbookId, payloadId } },
              create: { logbookId, payloadId, entryId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'voiceMemo') {
          {
            const existing = await prisma.voiceMemoPayload.findUnique({
              where: { logbookId_payloadId: { logbookId, payloadId } }
            })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            const entryId = parsed.entryId || ''
            await prisma.voiceMemoPayload.upsert({
              where: { logbookId_payloadId: { logbookId, payloadId } },
              create: { logbookId, payloadId, entryId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'gpsTrack') {
          {
            const existing = await prisma.gpsTrackPayload.findUnique({
              where: { entryId: payloadId }
            })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            await prisma.gpsTrackPayload.upsert({
              where: { entryId: payloadId },
              create: { logbookId, entryId: payloadId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'logbookCrew') {
          const { hasCrewPoolPrismaModels, CREW_POOL_MIGRATION_HINT } =
            await import('../utils/crewPoolSchema.js')
          if (!hasCrewPoolPrismaModels()) {
            results.push({
              payloadId,
              status: 'error',
              error: CREW_POOL_MIGRATION_HINT
            })
            continue
          }
          {
            const existing = await prisma.logbookCrewSelectionPayload.findUnique({ where: { logbookId } })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            await prisma.logbookCrewSelectionPayload.upsert({
              where: { logbookId },
              create: { logbookId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          }
        } else if (type === 'logbookVessel') {
          const { hasVesselPoolPrismaModels, isMissingPrismaTable, VESSEL_POOL_MIGRATION_HINT } =
            await import('../utils/crewPoolSchema.js')
          if (!hasVesselPoolPrismaModels()) {
            results.push({
              payloadId,
              status: 'error',
              error: VESSEL_POOL_MIGRATION_HINT
            })
            continue
          }
          try {
            const existing = await prisma.logbookVesselSelectionPayload.findUnique({ where: { logbookId } })
            if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
              results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
              continue
            }
            await prisma.logbookVesselSelectionPayload.upsert({
              where: { logbookId },
              create: { logbookId, encryptedData, iv, tag, updatedAt: itemUpdatedAt },
              update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
            })
          } catch (err: unknown) {
            if (isMissingPrismaTable(err)) {
              results.push({ payloadId, status: 'error', error: VESSEL_POOL_MIGRATION_HINT })
              continue
            }
            throw err
          }
        }

        recordCollaboratorChange(
          logbook.userId,
          logbookId,
          isOwner,
          collaboration,
          action,
          type
        )
        results.push({ payloadId, status: 'success' })
      } catch (err: any) {
        console.error(`Error processing sync item ${payloadId}:`, err)
        results.push({ payloadId, status: 'error', error: err.message || 'Operation failed' })
      }
    }

    for (const { ownerId, logbookId, count } of ownerNotifications.values()) {
      void notifyOwnerOfCollaboratorChanges(logbookId, ownerId, req.userId, count)
    }

    return res.json({ results })
  } catch (error: any) {
    console.error('Error during sync push:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 2. Pull server updates to the client
router.get('/pull', async (req: any, res) => {
  try {
    const { logbookId } = req.query
    if (!logbookId) {
      return res.status(400).json({ error: 'logbookId is required' })
    }

    // Authorize: Check if logbook belongs to user or is collaborator
    const logbook = await prisma.logbook.findUnique({
      where: { id: logbookId }
    })

    if (!logbook) {
      return res.status(404).json({ error: 'Logbook not found' })
    }

    const isOwner = logbook.userId === req.userId
    const collaboration = await prisma.collaboration.findUnique({
      where: {
        logbookId_userId: {
          logbookId,
          userId: req.userId
        }
      }
    })

    if (!isOwner && !collaboration) {
      return res.status(403).json({ error: 'Forbidden: Access denied' })
    }

    const yacht = await prisma.yachtPayload.findUnique({ where: { logbookId } })
    const deviation = await prisma.deviationPayload.findUnique({ where: { logbookId } })
    const crews = await prisma.crewPayload.findMany({ where: { logbookId } })
    const entries = await prisma.entryPayload.findMany({ where: { logbookId } })
    const photos = await prisma.photoPayload.findMany({ where: { logbookId } })
    const voiceMemos = await prisma.voiceMemoPayload.findMany({ where: { logbookId } })
    const gpsTracks = await prisma.gpsTrackPayload.findMany({ where: { logbookId } })
    const { findLogbookCrewSelectionSafe, findLogbookVesselSelectionSafe } =
      await import('../utils/crewPoolSchema.js')
    const logbookCrewSelection = await findLogbookCrewSelectionSafe(logbookId)
    const logbookVesselSelection = await findLogbookVesselSelectionSafe(logbookId)

    return res.json({
      yacht,
      deviation,
      crews,
      logbookCrewSelection,
      logbookVesselSelection,
      entries,
      photos,
      voiceMemos,
      gpsTracks
    })
  } catch (error: any) {
    console.error('Error during sync pull:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
