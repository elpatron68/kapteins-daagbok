import { Router } from 'express'
import { prisma } from '../db.js'

const router = Router()

// Middleware to extract user ID from headers (for authenticated routes)
const requireUser = (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id']
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: X-User-Id header missing' })
  }
  req.userId = userId
  next()
}

// 1. Get invitation details (public route, does not require authentication)
router.get('/invite-details', async (req: any, res) => {
  try {
    const { token } = req.query
    if (!token) {
      return res.status(400).json({ error: 'Token is required' })
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        logbook: {
          include: {
            user: {
              select: { username: true }
            }
          }
        }
      }
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (new Date() > invitation.expiresAt) {
      return res.status(410).json({ error: 'Invitation has expired' })
    }

    return res.json({
      logbookId: invitation.logbookId,
      ownerUsername: invitation.logbook.user.username,
      encryptedTitle: invitation.logbook.encryptedTitle,
      role: invitation.role
    })
  } catch (error: any) {
    console.error('Error fetching invite details:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 2. Accept invitation (requires authenticated invitee)
router.post('/accept', requireUser, async (req: any, res) => {
  try {
    const { token, encryptedLogbookKey, iv, tag } = req.body
    if (!token || !encryptedLogbookKey || !iv || !tag) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token }
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (new Date() > invitation.expiresAt) {
      return res.status(410).json({ error: 'Invitation has expired' })
    }

    // Check if user is already a collaborator or owner
    const logbook = await prisma.logbook.findUnique({
      where: { id: invitation.logbookId }
    })

    if (!logbook) {
      return res.status(404).json({ error: 'Logbook not found' })
    }

    if (logbook.userId === req.userId) {
      return res.status(400).json({ error: 'You are already the owner of this logbook' })
    }

    // Create collaboration record
    const collaboration = await prisma.collaboration.upsert({
      where: {
        logbookId_userId: {
          logbookId: invitation.logbookId,
          userId: req.userId
        }
      },
      create: {
        logbookId: invitation.logbookId,
        userId: req.userId,
        role: invitation.role,
        encryptedLogbookKey,
        iv,
        tag
      },
      update: {
        role: invitation.role,
        encryptedLogbookKey,
        iv,
        tag
      }
    })

    return res.json({
      success: true,
      logbookId: invitation.logbookId,
      role: invitation.role
    })
  } catch (error: any) {
    console.error('Error accepting invitation:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// All subsequent routes require authentication
router.use(requireUser)

// 3. Create invitation token (Owner only)
router.post('/invite', async (req: any, res) => {
  try {
    const { logbookId, role } = req.body
    if (!logbookId) {
      return res.status(400).json({ error: 'logbookId is required' })
    }

    const logbook = await prisma.logbook.findUnique({
      where: { id: logbookId }
    })

    if (!logbook) {
      return res.status(404).json({ error: 'Logbook not found' })
    }

    // Only owner can invite
    if (logbook.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: Only the owner can invite collaborators' })
    }

    // Set expiration to 48 hours from now
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 48)

    const invitation = await prisma.invitation.create({
      data: {
        logbookId,
        role: role || 'WRITE',
        expiresAt
      }
    })

    return res.json({
      token: invitation.token,
      expiresAt: invitation.expiresAt
    })
  } catch (error: any) {
    console.error('Error creating invitation:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 4. Get list of current collaborators
router.get('/collaborators', async (req: any, res) => {
  try {
    const { logbookId } = req.query
    if (!logbookId) {
      return res.status(400).json({ error: 'logbookId is required' })
    }

    const logbook = await prisma.logbook.findUnique({
      where: { id: logbookId }
    })

    if (!logbook) {
      return res.status(404).json({ error: 'Logbook not found' })
    }

    if (logbook.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: Access denied' })
    }

    const collaborators = await prisma.collaboration.findMany({
      where: { logbookId },
      include: {
        user: {
          select: { username: true }
        }
      }
    })

    return res.json(collaborators.map((c: any) => ({
      id: c.id,
      userId: c.userId,
      username: c.user.username,
      role: c.role,
      createdAt: c.createdAt
    })))
  } catch (error: any) {
    console.error('Error fetching collaborators:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 5. Revoke collaborator access (Owner only)
router.delete('/collaborators/:id', async (req: any, res) => {
  try {
    const { id } = req.params

    const collaboration = await prisma.collaboration.findUnique({
      where: { id },
      include: { logbook: true }
    })

    if (!collaboration) {
      return res.status(404).json({ error: 'Collaboration not found' })
    }

    // Only owner can revoke
    if (collaboration.logbook.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: Only the owner can revoke access' })
    }

    await prisma.collaboration.delete({
      where: { id }
    })

    return res.json({ success: true })
  } catch (error: any) {
    console.error('Error revoking collaboration:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
