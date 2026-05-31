/**
 * Shared DeepL API helpers for batch translation scripts.
 * @see https://developers.deepl.com/docs/getting-started/quickstart
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')

/** Terms that must not be translated (product, tech, brands). */
export const NO_TRANSLATE_TERMS = [
  'Kapteins Daagbok',
  'Kiel.Sailing.City.',
  'KnorrLabs',
  'Markus F.J. Busche',
  'kapteins-daagbok.eu',
  'elpatron+kd@mailbox.org',
  'GPX/KML',
  'GPX',
  'KML',
  'PDF',
  'CSV',
  'PWA',
  'E2E',
  'Passkey',
  'OpenWeatherMap',
  'Safari',
  'iPad',
  'iPhone',
  'Android',
  'Knorrstr. 16 · 24106 Kiel',
  'KnorrLabs · Markus F.J. Busche · Knorrstr. 16 · 24106 Kiel · elpatron+kd@mailbox.org'
]

const PLACEHOLDER_RE = /\{\{[^}]+\}\}/g

export function loadEnvKey() {
  const fromEnv = process.env.DEEPL_API_KEY ?? process.env.DeepLAPIKey
  if (fromEnv) return fromEnv.trim()

  try {
    const envPath = resolve(repoRoot, '.env')
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^(?:DEEPL_API_KEY|DeepLAPIKey)\s*=\s*(.+)$/)
      if (match) return match[1].trim()
    }
  } catch {
    // .env optional when key is exported in shell
  }

  throw new Error('DeepL API key missing. Set DEEPL_API_KEY or DeepLAPIKey in .env')
}

export function resolveApiUrl(apiKey) {
  if (process.env.DEEPL_API_URL) return process.env.DEEPL_API_URL
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

export function protectText(text) {
  const segments = []
  let protectedText = text.replace(PLACEHOLDER_RE, (match) => {
    const id = segments.length
    segments.push(match)
    return `__X${id}__`
  })

  for (const term of NO_TRANSLATE_TERMS) {
    if (!protectedText.includes(term)) continue
    const id = segments.length
    segments.push(term)
    protectedText = protectedText.split(term).join(`__X${id}__`)
  }

  return { text: protectedText, segments }
}

export function restoreText(text, segments) {
  let restored = text
  segments.forEach((value, id) => {
    restored = restored.replaceAll(`__X${id}__`, value)
    restored = restored.replaceAll(`__ X ${id} __`, value)
    restored = restored.replaceAll(`__X ${id}__`, value)
  })
  return restored
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

export async function translateBatch(texts, targetLang, { sourceLang = 'DE', apiKey, retries = 3 } = {}) {
  if (texts.length === 0) return []

  const key = apiKey ?? loadEnvKey()
  const url = resolveApiUrl(key)
  const protectedEntries = texts.map((text) => protectText(text))

  const body = {
    text: protectedEntries.map((entry) => entry.text),
    source_lang: sourceLang,
    target_lang: targetLang
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json',
        'User-Agent': 'kapteins-daagbok-translate/1.0'
      },
      body: JSON.stringify(body)
    })

    if (response.status === 429 && attempt < retries - 1) {
      const waitMs = 1500 * (attempt + 1)
      console.warn(`Rate limited — waiting ${waitMs}ms…`)
      await sleep(waitMs)
      continue
    }

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`DeepL error ${response.status}: ${detail}`)
    }

    const payload = await response.json()
    return payload.translations.map((item, index) =>
      restoreText(item.text, protectedEntries[index].segments)
    )
  }

  throw new Error('DeepL translation failed after retries')
}

export async function translateTexts(texts, targetLang, options = {}) {
  const batchSize = options.batchSize ?? 40
  const results = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const translated = await translateBatch(batch, targetLang, options)
    results.push(...translated)
    if (i + batchSize < texts.length) {
      process.stdout.write(`  ${Math.min(i + batchSize, texts.length)}/${texts.length}\r`)
      await sleep(300)
    }
  }

  process.stdout.write(`  ${texts.length}/${texts.length}\n`)
  return results
}

export function flattenTranslation(obj, prefix = '') {
  const entries = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenTranslation(value, path))
    } else if (typeof value === 'string') {
      entries.push([path, value])
    }
  }
  return entries
}

export function unflattenTranslation(entries) {
  const root = {}
  for (const [path, value] of entries) {
    const parts = path.split('.')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] ??= {}
      node = node[parts[i]]
    }
    node[parts[parts.length - 1]] = value
  }
  return root
}
