const SIGNATURE_KEYS = new Set(['signSkipper', 'signCrew'])
const AI_SUMMARY_KEYS = new Set(['aiSummary', 'aiSummaryGeneratedAt'])

function sortEventsByTime(items: unknown[]): unknown[] {
  return [...items]
    .sort((a, b) => {
      const timeA =
        typeof a === 'object' && a !== null && 'time' in a
          ? String((a as Record<string, unknown>).time)
          : ''
      const timeB =
        typeof b === 'object' && b !== null && 'time' in b
          ? String((b as Record<string, unknown>).time)
          : ''
      return timeA.localeCompare(timeB)
    })
    .map((item) => sortValue(item))
}

function sortValue(value: unknown, parentKey?: string): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    if (parentKey === 'events') return sortEventsByTime(value)
    return value.map((item) => sortValue(item))
  }
  const obj = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    if (SIGNATURE_KEYS.has(key) || AI_SUMMARY_KEYS.has(key)) continue
    sorted[key] = sortValue(obj[key], key)
  }
  return sorted
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Stabil sortiertes JSON → SHA-256 → base64url */
export async function hashEntryForSigning(entry: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(sortValue(entry))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return bufferToBase64url(digest)
}
