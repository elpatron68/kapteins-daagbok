import type { Request, Response, NextFunction } from 'express'
import { hasValidReauth, readSessionFromRequest } from '../session.js'
import { isAdminUserId } from '../adminConfig.js'

export interface AuthedRequest extends Request {
  userId: string
  session: NonNullable<ReturnType<typeof readSessionFromRequest>>
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const session = readSessionFromRequest(req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized: valid session required' })
    return
  }
  ;(req as AuthedRequest).userId = session.userId
  ;(req as AuthedRequest).session = session
  next()
}

export function requireReauth(req: Request, res: Response, next: NextFunction): void {
  const session = readSessionFromRequest(req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized: valid session required' })
    return
  }
  if (!hasValidReauth(session)) {
    res.status(403).json({ error: 'Recent passkey confirmation required' })
    return
  }
  ;(req as AuthedRequest).userId = session.userId
  ;(req as AuthedRequest).session = session
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = readSessionFromRequest(req)
  if (!session) {
    res.status(401).json({ error: 'Unauthorized: valid session required' })
    return
  }

  if (!isAdminUserId(session.userId)) {
    res.status(403).json({ error: 'Forbidden: admin access required' })
    return
  }

  ;(req as AuthedRequest).userId = session.userId
  ;(req as AuthedRequest).session = session
  next()
}

