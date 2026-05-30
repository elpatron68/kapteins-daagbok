import { Router } from 'express'
import { isNtfyConfigured, sendFeedbackViaNtfy } from '../services/ntfyNotify.js'

const router = Router()

const VALID_CATEGORIES = new Set(['bug', 'feature', 'general'])
const MAX_MESSAGE_LENGTH = 2000
const MAX_EMAIL_LENGTH = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseOptionalEmail(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_EMAIL_LENGTH) return undefined
  if (!EMAIL_PATTERN.test(trimmed)) return undefined

  return trimmed
}

const requireUser = (req: any, res: any, next: any) => {
  const userId = req.headers['x-user-id']
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: X-User-Id header missing' })
  }
  req.userId = userId
  next()
}

router.get('/status', requireUser, (_req, res) => {
  res.json({ enabled: isNtfyConfigured() })
})

router.post('/', requireUser, async (req: any, res) => {
  try {
    if (!isNtfyConfigured()) {
      return res.status(503).json({ error: 'Feedback is not configured on this server' })
    }

    const { category, message, username, contactEmail, logbookId, logbookTitle, appVersion, pageUrl } =
      req.body ?? {}

    if (typeof category !== 'string' || !VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid category' })
    }

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' })
    }

    const trimmedMessage = message.trim()
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message must be at most ${MAX_MESSAGE_LENGTH} characters` })
    }

    let parsedContactEmail: string | undefined
    if (contactEmail !== undefined && contactEmail !== null && String(contactEmail).trim()) {
      parsedContactEmail = parseOptionalEmail(contactEmail)
      if (!parsedContactEmail) {
        return res.status(400).json({ error: 'Invalid email address' })
      }
    }

    await sendFeedbackViaNtfy({
      category,
      message: trimmedMessage,
      username: typeof username === 'string' ? username.trim() : undefined,
      contactEmail: parsedContactEmail,
      userId: req.userId,
      logbookId: typeof logbookId === 'string' ? logbookId.trim() : undefined,
      logbookTitle: typeof logbookTitle === 'string' ? logbookTitle.trim() : undefined,
      appVersion: typeof appVersion === 'string' ? appVersion.trim() : undefined,
      pageUrl: typeof pageUrl === 'string' ? pageUrl.trim() : undefined
    })

    return res.json({ ok: true })
  } catch (error: any) {
    console.error('Error sending feedback via Ntfy:', error)
    return res.status(502).json({ error: error.message || 'Failed to send feedback' })
  }
})

export default router
