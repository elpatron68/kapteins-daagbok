import type { CorsOptions } from 'cors'

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '')
}

/** Origins allowed for credentialed CORS (must match the browser frontend URL exactly). */
export function getAllowedCorsOrigins(): Set<string> {
  const raw =
    process.env.CORS_ORIGINS?.trim() ||
    process.env.ORIGIN?.trim() ||
    'http://localhost:5173'

  const origins = raw
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)

  const allowed = new Set(origins)

  if (process.env.NODE_ENV !== 'production') {
    for (const dev of [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173'
    ]) {
      allowed.add(dev)
    }
  }

  return allowed
}

export function buildCorsOptions(): CorsOptions {
  const allowed = getAllowedCorsOrigins()

  return {
    origin(origin, callback) {
      // Non-browser clients, same-origin via reverse proxy (no Origin header)
      if (!origin) {
        callback(null, true)
        return
      }

      const normalized = normalizeOrigin(origin)
      if (allowed.has(normalized)) {
        callback(null, normalized)
        return
      }

      console.warn(
        `[cors] Rejected origin "${origin}". Allowed: ${[...allowed].join(', ')}`
      )
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true
  }
}
