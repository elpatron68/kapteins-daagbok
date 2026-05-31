import { apiFetch } from './api.js'

export type FeedbackCategory = 'bug' | 'feature' | 'general' | 'translation'

export class FeedbackApiError extends Error {
  code: 'NOT_CONFIGURED' | 'REQUEST_FAILED' | 'INVALID_EMAIL' | 'RATE_LIMITED' | 'SPAM_DETECTED'

  constructor(
    message: string,
    code: 'NOT_CONFIGURED' | 'REQUEST_FAILED' | 'INVALID_EMAIL' | 'RATE_LIMITED' | 'SPAM_DETECTED' = 'REQUEST_FAILED'
  ) {
    super(message)
    this.name = 'FeedbackApiError'
    this.code = code
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidFeedbackEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim())
}

export async function sendFeedback(payload: {
  category: FeedbackCategory
  message: string
  contactEmail?: string | null
  logbookId?: string | null
  logbookTitle?: string | null
  openedAt: number
  website?: string
}): Promise<void> {
  const contactEmail = payload.contactEmail?.trim()
  if (contactEmail && !isValidFeedbackEmail(contactEmail)) {
    throw new FeedbackApiError('Invalid email address', 'INVALID_EMAIL')
  }

  const res = await apiFetch('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({
      category: payload.category,
      message: payload.message,
      contactEmail: contactEmail || undefined,
      username: localStorage.getItem('active_username') || undefined,
      logbookId: payload.logbookId || undefined,
      logbookTitle: payload.logbookTitle || undefined,
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
      pageUrl: window.location.href,
      openedAt: payload.openedAt,
      website: payload.website || undefined
    })
  })

  if (res.status === 503) {
    throw new FeedbackApiError('Feedback is not configured on this server', 'NOT_CONFIGURED')
  }

  if (res.status === 429) {
    throw new FeedbackApiError('Too many feedback submissions', 'RATE_LIMITED')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new FeedbackApiError(
      data.error || 'Failed to send feedback',
      data.code === 'SPAM_DETECTED' ? 'SPAM_DETECTED' : 'REQUEST_FAILED'
    )
  }
}
