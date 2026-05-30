import rateLimit from 'express-rate-limit'
import type { AuthedRequest } from './auth.js'

const MIN_SUBMIT_MS = 2_000
const MAX_SUBMIT_MS = 60 * 60 * 1000
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000
const MAX_URLS = 8
const MAX_REPEATED_CHAR = 40

const recentByUser = new Map<string, { hash: string; at: number }>()

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ')
}

function countUrls(message: string): number {
  const matches = message.match(/https?:\/\/|www\./gi)
  return matches?.length ?? 0
}

function hasExcessiveRepeatedChars(message: string): boolean {
  return /(.)\1{39,}/.test(message)
}

function pruneRecentEntries(now: number): void {
  for (const [userId, entry] of recentByUser) {
    if (now - entry.at > DUPLICATE_WINDOW_MS) {
      recentByUser.delete(userId)
    }
  }
}

export type FeedbackSpamVerdict = 'ok' | 'silent_reject' | 'reject'

export function analyzeFeedbackSpam(
  userId: string,
  payload: { message: string; website?: unknown; openedAt?: unknown }
): FeedbackSpamVerdict {
  if (typeof payload.website === 'string' && payload.website.trim()) {
    return 'silent_reject'
  }

  if (typeof payload.openedAt === 'number' && Number.isFinite(payload.openedAt)) {
    const elapsed = Date.now() - payload.openedAt
    if (elapsed < MIN_SUBMIT_MS || elapsed > MAX_SUBMIT_MS) {
      return 'silent_reject'
    }
  }

  const normalized = normalizeMessage(payload.message)
  const now = Date.now()
  pruneRecentEntries(now)

  const previous = recentByUser.get(userId)
  if (previous && previous.hash === normalized && now - previous.at < DUPLICATE_WINDOW_MS) {
    return 'reject'
  }

  if (countUrls(payload.message) > MAX_URLS || hasExcessiveRepeatedChars(payload.message)) {
    return 'reject'
  }

  recentByUser.set(userId, { hash: normalized, at: now })
  return 'ok'
}

export const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many feedback submissions. Please try again later.',
      code: 'RATE_LIMITED'
    })
  }
})
