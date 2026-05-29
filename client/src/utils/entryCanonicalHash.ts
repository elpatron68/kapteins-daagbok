function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortValue)
  const obj = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortValue(obj[key])
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
