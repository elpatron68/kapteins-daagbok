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

// 1. Get all logbooks for the authenticated user
router.get('/', async (req: any, res) => {
  try {
    const logbooks = await prisma.logbook.findMany({
      where: { userId: req.userId },
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
    const { id, encryptedTitle } = req.body
    if (!encryptedTitle) {
      return res.status(400).json({ error: 'encryptedTitle is required' })
    }

    const logbook = await prisma.logbook.create({
      data: {
        id: id || undefined,
        userId: req.userId,
        encryptedTitle
      }
    })

    return res.json(logbook)
  } catch (error: any) {
    console.error('Error creating logbook:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 3. Delete a logbook
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
