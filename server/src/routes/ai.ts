import { Router } from 'express'
import { prisma } from '../db.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

const PARAKEET_URL = process.env.PARAKEET_URL || 'http://localhost:5092/v1/audio/transcriptions'
const MAX_ATTEMPTS_PER_ENTRY = 3
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const FETCH_TIMEOUT_MS = 60_000

/** Common misconfiguration aliases → valid OpenRouter model IDs */
const MODEL_ALIASES: Record<string, string> = {
  'anthropic/claude-haiku-latest': 'anthropic/claude-3.5-haiku',
  'claude-haiku-latest': 'anthropic/claude-3.5-haiku'
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: 'German',
  en: 'English',
  da: 'Danish',
  nb: 'Norwegian Bokmål',
  sv: 'Swedish'
}

function resolveOpenRouterApiKey(): string | null {
  const fromEnv =
    process.env.OpenRouterAPIKey?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim()
  return fromEnv || null
}

function resolveOpenRouterModel(): string {
  const configured =
    process.env.OpenRouterModel?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    DEFAULT_MODEL
  return MODEL_ALIASES[configured] ?? configured
}

function extractOpenRouterError(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const nested = (data as { error?: { message?: string } }).error
  if (nested && typeof nested.message === 'string' && nested.message.trim()) {
    return nested.message.trim()
  }
  const topLevel = (data as { error?: string }).error
  if (typeof topLevel === 'string' && topLevel.trim()) return topLevel.trim()
  return null
}

async function getLogbookOwner(logbookId: string) {
  return prisma.logbook.findUnique({
    where: { id: logbookId },
    select: { userId: true }
  })
}

async function getUsageCount(logbookId: string, entryId: string): Promise<number> {
  const row = await prisma.aiSummaryUsage.findUnique({
    where: { logbookId_entryId: { logbookId, entryId } },
    select: { count: true }
  })
  return row?.count ?? 0
}

function remainingAttempts(used: number): number {
  return Math.max(0, MAX_ATTEMPTS_PER_ENTRY - used)
}

function resolveLanguageLabel(language: unknown): string {
  if (typeof language === 'string' && LANGUAGE_LABELS[language]) {
    return LANGUAGE_LABELS[language]
  }
  return LANGUAGE_LABELS.en
}

function buildSystemPrompt(languageLabel: string): string {
  return [
    'You are a maritime logbook assistant for sailing yachts.',
    `Write a concise narrative summary of one travel day in ${languageLabel}.`,
    'Use 2–4 short paragraphs in plain prose.',
    'Cover route, sailing conditions, notable events, and tank/fuel highlights when data is present.',
    'Do not invent facts not supported by the input.',
    'Do not include coordinates, personal names, or signature metadata.',
    'Respond with the summary text only — no title, markdown, or JSON.'
  ].join(' ')
}

router.use(requireUser)

router.get('/usage', async (req: any, res) => {
  try {
    const logbookId = String(req.query.logbookId || '')
    const entryId = String(req.query.entryId || '')
    if (!logbookId || !entryId) {
      return res.status(400).json({ error: 'logbookId and entryId are required' })
    }

    const logbook = await getLogbookOwner(logbookId)
    if (!logbook) return res.status(404).json({ error: 'Logbook not found' })
    if (logbook.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: Skipper only' })
    }

    const used = await getUsageCount(logbookId, entryId)
    return res.json({ remainingAttempts: remainingAttempts(used), maxAttempts: MAX_ATTEMPTS_PER_ENTRY })
  } catch (error: unknown) {
    console.error('AI summary usage lookup failed:', error)
    return res.status(500).json({ error: 'Failed to load AI summary usage' })
  }
})

router.post('/summary', async (req: any, res) => {
  try {
    const { logbookId, entryId, language, context } = req.body ?? {}
    if (!logbookId || !entryId || !context || typeof context !== 'object') {
      return res.status(400).json({ error: 'logbookId, entryId, and context are required' })
    }

    const logbook = await getLogbookOwner(String(logbookId))
    if (!logbook) return res.status(404).json({ error: 'Logbook not found' })
    if (logbook.userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden: Skipper only' })
    }

    const used = await getUsageCount(String(logbookId), String(entryId))
    if (used >= MAX_ATTEMPTS_PER_ENTRY) {
      return res.status(429).json({
        error: 'Rate limit exceeded for this travel day',
        code: 'RATE_LIMITED',
        remainingAttempts: 0,
        maxAttempts: MAX_ATTEMPTS_PER_ENTRY
      })
    }

    const apiKey = resolveOpenRouterApiKey()
    if (!apiKey) {
      return res.status(503).json({
        error: 'No OpenRouter API key configured',
        code: 'NO_KEY'
      })
    }

    const languageLabel = resolveLanguageLabel(language)
    const model = resolveOpenRouterModel()
    const contextJson = JSON.stringify(context)
    if (contextJson.length > 100_000) {
      return res.status(400).json({ error: 'Travel day context is too large' })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let openRouterRes: Response
    try {
      openRouterRes = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.ORIGIN || 'https://kapteins-daagbok.eu',
          'X-Title': 'Kapteins Daagbok'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(languageLabel) },
            {
              role: 'user',
              content: `Summarize this travel day from the structured log data:\n\n${contextJson}`
            }
          ],
          max_tokens: 800,
          temperature: 0.4
        }),
        signal: controller.signal
      })
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return res.status(504).json({ error: 'OpenRouter request timed out' })
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }

    const data = await openRouterRes.json().catch(() => ({}))
    if (!openRouterRes.ok) {
      const detail = extractOpenRouterError(data)
      console.error('OpenRouter error:', openRouterRes.status, data)
      return res.status(502).json({
        error: detail || 'OpenRouter request failed',
        code: 'OPENROUTER_ERROR'
      })
    }

    const summary =
      typeof data === 'object' &&
      data !== null &&
      Array.isArray((data as { choices?: unknown[] }).choices) &&
      (data as { choices: Array<{ message?: { content?: string } }> }).choices[0]?.message?.content
        ? String((data as { choices: Array<{ message?: { content?: string } }> }).choices[0].message?.content).trim()
        : ''

    if (!summary) {
      return res.status(502).json({ error: 'OpenRouter returned an empty summary' })
    }

    const updated = await prisma.aiSummaryUsage.upsert({
      where: {
        logbookId_entryId: { logbookId: String(logbookId), entryId: String(entryId) }
      },
      create: {
        logbookId: String(logbookId),
        entryId: String(entryId),
        count: 1
      },
      update: { count: { increment: 1 } }
    })

    return res.json({
      summary,
      remainingAttempts: remainingAttempts(updated.count),
      maxAttempts: MAX_ATTEMPTS_PER_ENTRY
    })
  } catch (error: unknown) {
    console.error('AI summary generation failed:', error)
    return res.status(500).json({ error: 'Failed to generate AI summary' })
  }
})

router.post('/transcribe', async (req: any, res) => {
  try {
    const { audioDataUrl } = req.body ?? {}
    if (!audioDataUrl || typeof audioDataUrl !== 'string') {
      return res.status(400).json({ error: 'audioDataUrl is required' })
    }

    const match = audioDataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      return res.status(400).json({ error: 'Invalid audio data URL format' })
    }

    const [, mimeType, base64Data] = match
    const buffer = Buffer.from(base64Data, 'base64')

    let ext = 'webm'
    if (mimeType.includes('mp4')) ext = 'mp4'
    else if (mimeType.includes('ogg')) ext = 'ogg'
    else if (mimeType.includes('wav')) ext = 'wav'

    const filename = `audio.${ext}`
    const file = new File([buffer], filename, { type: mimeType })

    const formData = new FormData()
    formData.append('file', file)

    console.log(`[server] Forwarding ASR request to ${PARAKEET_URL} (${filename}, ${buffer.length} bytes)`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const parakeetRes = await fetch(PARAKEET_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })

      if (!parakeetRes.ok) {
        const errorText = await parakeetRes.text().catch(() => '')
        console.error(`[server] Parakeet ASR error response (status=${parakeetRes.status}):`, errorText)
        throw new Error(`Parakeet returned status ${parakeetRes.status}`)
      }

      const data: any = await parakeetRes.json()
      const text = (data?.text || '').trim()

      console.log(`[server] ASR completed successfully: "${text}"`)
      return res.json({ text })
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[server] Parakeet ASR request timed out')
        return res.status(504).json({ error: 'Transcription request timed out' })
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error: unknown) {
    console.error('ASR transcription failed:', error)
    return res.status(503).json({ error: 'Transcription service unavailable' })
  }
})

export default router
