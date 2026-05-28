import { Router } from 'express'
import { prisma } from '../db.js'

const router = Router()

// Middleware to extract user ID from headers
const requireUser = (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id']
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: X-User-Id header missing' })
  }
  req.userId = userId
  next()
}

router.use(requireUser)

// 1. Push local changes to the server
router.post('/push', async (req: any, res) => {
  try {
    const { items } = req.body
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' })
    }

    const results = []

    for (const item of items) {
      const { action, type, payloadId, logbookId, data, updatedAt } = item
      const itemUpdatedAt = new Date(updatedAt)

      try {
        // Authorize: Check if logbook belongs to user
        // Exception: If action is create logbook, the logbook might not exist yet,
        // so we authorize based on user creating a logbook with their userId.
        if (type === 'logbook' && action === 'create') {
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
              updatedAt: itemUpdatedAt
            },
            update: {
              encryptedTitle: parsed.encryptedTitle,
              updatedAt: itemUpdatedAt
            }
          })
          results.push({ payloadId, status: 'success' })
          continue
        }

        // Standard Authorization: Logbook must exist and belong to user
        const logbook = await prisma.logbook.findUnique({
          where: { id: logbookId }
        })

        if (!logbook) {
          results.push({ payloadId, status: 'error', error: 'Logbook not found' })
          continue
        }

        if (logbook.userId !== req.userId) {
          results.push({ payloadId, status: 'error', error: 'Forbidden: Access denied' })
          continue
        }

        if (type === 'logbook' && action === 'delete') {
          await prisma.logbook.delete({
            where: { id: logbookId }
          })
          results.push({ payloadId, status: 'success' })
          continue
        }

        // Parse Payload parameters
        const parsed = JSON.parse(data)
        const encryptedData = parsed.encryptedData || parsed.ciphertext
        const { iv, tag } = parsed

        if (type === 'yacht') {
          if (action === 'delete') {
            await prisma.yachtPayload.deleteMany({ where: { logbookId } })
          } else {
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
          if (action === 'delete') {
            await prisma.deviationPayload.deleteMany({ where: { logbookId } })
          } else {
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
          if (action === 'delete') {
            await prisma.crewPayload.deleteMany({ where: { logbookId, payloadId } })
          } else {
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
          if (action === 'delete') {
            await prisma.entryPayload.deleteMany({ where: { logbookId, payloadId } })
          } else {
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
        }

        results.push({ payloadId, status: 'success' })
      } catch (err: any) {
        console.error(`Error processing sync item ${payloadId}:`, err)
        results.push({ payloadId, status: 'error', error: err.message || 'Operation failed' })
      }
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

    // Authorize: Check if logbook belongs to user
    const logbook = await prisma.logbook.findUnique({
      where: { id: logbookId }
    })

    if (!logbook) {
      return res.status(404).json({ error: 'Logbook not found' })
    }

    if (logbook.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: Access denied' })
    }

    const yacht = await prisma.yachtPayload.findUnique({ where: { logbookId } })
    const deviation = await prisma.deviationPayload.findUnique({ where: { logbookId } })
    const crews = await prisma.crewPayload.findMany({ where: { logbookId } })
    const entries = await prisma.entryPayload.findMany({ where: { logbookId } })

    return res.json({
      yacht,
      deviation,
      crews,
      entries
    })
  } catch (error: any) {
    console.error('Error during sync pull:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
