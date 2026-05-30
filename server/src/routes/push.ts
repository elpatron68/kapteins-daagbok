import { Router } from 'express'
import { prisma } from '../db.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

function isValidHttpsEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

router.get('/vapid-public-key', (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server' })
  }
  return res.json({ publicKey })
})

router.use(requireUser)

router.get('/prefs', async (req: any, res) => {
  try {
    const prefs = await prisma.userNotificationPrefs.findUnique({
      where: { userId: req.userId }
    })
    return res.json({
      collaboratorChangesEnabled: prefs?.collaboratorChangesEnabled ?? false
    })
  } catch (error: any) {
    console.error('Error reading push prefs:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

router.put('/prefs', async (req: any, res) => {
  try {
    const { collaboratorChangesEnabled } = req.body
    if (typeof collaboratorChangesEnabled !== 'boolean') {
      return res.status(400).json({ error: 'collaboratorChangesEnabled must be a boolean' })
    }

    const prefs = await prisma.userNotificationPrefs.upsert({
      where: { userId: req.userId },
      create: {
        userId: req.userId,
        collaboratorChangesEnabled,
        updatedAt: new Date()
      },
      update: {
        collaboratorChangesEnabled,
        updatedAt: new Date()
      }
    })

    return res.json({
      collaboratorChangesEnabled: prefs.collaboratorChangesEnabled
    })
  } catch (error: any) {
    console.error('Error updating push prefs:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

router.put('/subscription', async (req: any, res) => {
  try {
    const { endpoint, keys, locale, userAgent } = req.body
    if (!isValidHttpsEndpoint(endpoint)) {
      return res.status(400).json({ error: 'Invalid push subscription endpoint' })
    }
    if (!keys?.p256dh || !keys?.auth || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return res.status(400).json({ error: 'Invalid subscription keys' })
    }

    const normalizedLocale =
      typeof locale === 'string' && (locale === 'de' || locale === 'en') ? locale : null

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: req.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        locale: normalizedLocale,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null
      },
      update: {
        userId: req.userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        locale: normalizedLocale,
        userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
        updatedAt: new Date()
      }
    })

    return res.json({ success: true })
  } catch (error: any) {
    console.error('Error saving push subscription:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

router.delete('/subscription', async (req: any, res) => {
  try {
    const { endpoint } = req.body
    if (!isValidHttpsEndpoint(endpoint)) {
      return res.status(400).json({ error: 'Invalid push subscription endpoint' })
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: req.userId
      }
    })

    return res.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting push subscription:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
