export type FeedbackCategory = 'bug' | 'feature' | 'general'

export class FeedbackApiError extends Error {
  code: 'NOT_CONFIGURED' | 'REQUEST_FAILED'

  constructor(message: string, code: 'NOT_CONFIGURED' | 'REQUEST_FAILED' = 'REQUEST_FAILED') {
    super(message)
    this.name = 'FeedbackApiError'
    this.code = code
  }
}

function buildFeedbackHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  const userId = localStorage.getItem('active_userid')
  if (userId) headers['X-User-Id'] = userId
  return headers
}

export async function sendFeedback(payload: {
  category: FeedbackCategory
  message: string
  logbookId?: string | null
  logbookTitle?: string | null
}): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: buildFeedbackHeaders(),
    body: JSON.stringify({
      category: payload.category,
      message: payload.message,
      username: localStorage.getItem('active_username') || undefined,
      logbookId: payload.logbookId || undefined,
      logbookTitle: payload.logbookTitle || undefined,
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
      pageUrl: window.location.href
    })
  })

  if (res.status === 503) {
    throw new FeedbackApiError('Feedback is not configured on this server', 'NOT_CONFIGURED')
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new FeedbackApiError(data.error || 'Failed to send feedback')
  }
}
