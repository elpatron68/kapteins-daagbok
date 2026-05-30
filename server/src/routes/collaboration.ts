import { Router } from 'express'
import { prisma } from '../db.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

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

// 1b. Public read-only share pull endpoint (does not require authentication)
router.get('/share-pull', async (req: any, res) => {
  try {
    const { token } = req.query
    if (!token) {
      return res.status(400).json({ error: 'Token is required' })
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        logbook: true
      }
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Share link not found' })
    }

    if (new Date() > invitation.expiresAt) {
      return res.status(410).json({ error: 'Share link has expired' })
    }

    if (invitation.role !== 'READ') {
      return res.status(403).json({ error: 'Forbidden: Invalid role for public pull' })
    }

    const logbookId = invitation.logbookId

    const yacht = await prisma.yachtPayload.findUnique({ where: { logbookId } })
    const deviation = await prisma.deviationPayload.findUnique({ where: { logbookId } })
    const crews = await prisma.crewPayload.findMany({ where: { logbookId } })
    const entries = await prisma.entryPayload.findMany({ where: { logbookId } })
    const photos = await prisma.photoPayload.findMany({ where: { logbookId } })
    const gpsTracks = await prisma.gpsTrackPayload.findMany({ where: { logbookId } })

    return res.json({
      title: invitation.logbook.encryptedTitle,
      yacht,
      deviation,
      crews,
      entries,
      photos,
      gpsTracks
    })
  } catch (error: any) {
    console.error('Error in share-pull:', error)
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

// 6. Get public share link for a logbook (Owner only)
router.get('/share-link', async (req: any, res) => {
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

    const invitation = await prisma.invitation.findFirst({
      where: {
        logbookId,
        role: 'READ',
        expiresAt: {
          gt: new Date()
        }
      }
    })

    return res.json({
      token: invitation ? invitation.token : null,
      expiresAt: invitation ? invitation.expiresAt : null
    })
  } catch (error: any) {
    console.error('Error fetching share link:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 7. Toggle public share link for a logbook (Owner only)
router.post('/share-link', async (req: any, res) => {
  try {
    const { logbookId, enabled } = req.body
    if (!logbookId || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'logbookId and enabled are required' })
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

    if (enabled) {
      // Find existing active read-only invitation
      let invitation = await prisma.invitation.findFirst({
        where: {
          logbookId,
          role: 'READ',
          expiresAt: {
            gt: new Date()
          }
        }
      })

      if (!invitation) {
        // Create one that lasts 100 years
        const expiresAt = new Date()
        expiresAt.setFullYear(expiresAt.getFullYear() + 100)

        invitation = await prisma.invitation.create({
          data: {
            logbookId,
            role: 'READ',
            expiresAt
          }
        })
      }

      return res.json({
        token: invitation.token,
        expiresAt: invitation.expiresAt
      })
    } else {
      // Delete any READ invitations
      await prisma.invitation.deleteMany({
        where: {
          logbookId,
          role: 'READ'
        }
      })

      return res.json({ success: true })
    }
  } catch (error: any) {
    console.error('Error toggling share link:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
