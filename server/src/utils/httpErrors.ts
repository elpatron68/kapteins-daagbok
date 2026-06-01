import type { Response } from 'express'

const PUBLIC_ERROR = 'Internal server error'

/** Log full error server-side; never expose stack or Prisma internals to clients. */
export function sendInternalError(res: Response, error: unknown, context: string): Response {
  console.error(`[${context}]`, error)
  return res.status(500).json({ error: PUBLIC_ERROR })
}
