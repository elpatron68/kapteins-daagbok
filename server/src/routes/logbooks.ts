import { Router } from 'express'
import { prisma } from '../db.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

router.use(requireUser)

// 1. Get all logbooks for the authenticated user (owned and shared)
router.get('/', async (req: any, res) => {
  try {
    const logbooks = await prisma.logbook.findMany({
      where: {
        OR: [
          { userId: req.userId },
          {
            collaborators: {
              some: { userId: req.userId }
            }
          }
        ]
      },
      include: {
        collaborators: {
          where: { userId: req.userId }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(logbooks)
  } catch (error: any) {
    console.error('Error fetching logbooks:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 2. Create a new logbook
router.post('/', async (req: any, res) => {
  try {
    const { id, encryptedTitle, encryptedKey, iv, tag } = req.body
    if (!encryptedTitle) {
      return res.status(400).json({ error: 'encryptedTitle is required' })
    }

    const logbook = await prisma.logbook.create({
      data: {
        id: id || undefined,
        userId: req.userId,
        encryptedTitle,
        encryptedKey,
        iv,
        tag
      }
    })

    return res.json(logbook)
  } catch (error: any) {
    console.error('Error creating logbook:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 3. Access metadata for a logbook (owner / collaborator)
router.get('/:id/access', async (req: any, res) => {
  try {
    const { id } = req.params

    const logbook = await prisma.logbook.findUnique({
      where: { id },
      include: {
        collaborators: {
          where: { userId: req.userId }
        },
        _count: {
          select: {
            collaborators: {
              where: { role: 'WRITE' }
            }
          }
        }
      }
    })

    if (!logbook) {
      return res.status(404).json({ error: 'Logbook not found' })
    }

    const isOwner = logbook.userId === req.userId
    const collaboration = logbook.collaborators[0]

    if (!isOwner && !collaboration) {
      return res.status(403).json({ error: 'Forbidden: Access denied' })
    }

    return res.json({
      isOwner,
      role: isOwner ? 'OWNER' : collaboration!.role,
      writeCollaboratorCount: logbook._count.collaborators
    })
  } catch (error: any) {
    console.error('Error fetching logbook access:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 4. Delete a logbook
router.delete('/:id', async (req: any, res) => {
  try {
    const { id } = req.params

    const logbook = await prisma.logbook.findUnique({
      where: { id }
    })

    if (!logbook) {
      return res.status(404).json({ error: 'Logbook not found' })
    }

    if (logbook.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: Access denied' })
    }

    await prisma.logbook.delete({
      where: { id }
    })

    return res.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting logbook:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
