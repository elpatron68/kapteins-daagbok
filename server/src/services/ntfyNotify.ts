export interface FeedbackPayload {
  category: string
  message: string
  username?: string
  userId: string
  logbookId?: string
  logbookTitle?: string
  appVersion?: string
  pageUrl?: string
}

function resolveNtfyConfig(): { server: string; topic: string; token?: string } | null {
  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '')
  const topic = process.env.NTFY_TOPIC?.trim()
  const token = process.env.NTFY_TOKEN?.trim()

  if (!topic) return null

  return { server, topic, token: token || undefined }
}

export function isNtfyConfigured(): boolean {
  return resolveNtfyConfig() !== null
}

export async function sendFeedbackViaNtfy(payload: FeedbackPayload): Promise<void> {
  const config = resolveNtfyConfig()
  if (!config) {
    throw new Error('NTFY_TOPIC is not configured')
  }

  const categoryLabel = payload.category.charAt(0).toUpperCase() + payload.category.slice(1)
  const title = `Kapteins Daagbok – ${categoryLabel}`

  const lines = [
    payload.message,
    '',
    '---',
    `User: ${payload.username || '(unknown)'}`,
    `User ID: ${payload.userId}`
  ]

  if (payload.logbookTitle || payload.logbookId) {
    lines.push(`Logbook: ${payload.logbookTitle || payload.logbookId}`)
  }
  if (payload.appVersion) {
    lines.push(`App version: ${payload.appVersion}`)
  }
  if (payload.pageUrl) {
    lines.push(`Page: ${payload.pageUrl}`)
  }

  const headers: Record<string, string> = {
    Title: title,
    Tags: 'speech_balloon,ship',
    'Content-Type': 'text/plain; charset=utf-8'
  }

  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`
  }

  const url = `${config.server}/${encodeURIComponent(config.topic)}`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: lines.join('\n')
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ntfy request failed (${res.status})${body ? `: ${body}` : ''}`)
  }
}
