import crypto from 'crypto'
import type { CookieOptions, Request, Response } from 'express'

export const SESSION_COOKIE = 'daagbok_session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const REAUTH_MAX_AGE_MS = 10 * 60 * 1000

export interface SessionPayload {
  userId: string
  exp: number
  reauthExp?: number
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim()
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production (min. 32 characters)')
  }
  return 'dev-only-insecure-session-secret-change-me!!'
}

function sign(data: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(data).digest('base64url')
}

export function createSessionToken(userId: string, withReauth = true): string {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + SESSION_MAX_AGE_MS,
    ...(withReauth ? { reauthExp: Date.now() + REAUTH_MAX_AGE_MS } : {})
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(body)
  return `${body}.${signature}`
}

export function extendReauth(token: string): string | null {
  const payload = verifySessionToken(token)
  if (!payload) return null
  payload.reauthExp = Date.now() + REAUTH_MAX_AGE_MS
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (sig !== sign(body)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (!payload.userId || typeof payload.exp !== 'number') return null
    if (payload.exp <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function readSessionFromRequest(req: Request): SessionPayload | null {
  const raw = req.cookies?.[SESSION_COOKIE]
  if (typeof raw !== 'string') return null
  return verifySessionToken(raw)
}

export function sessionCookieOptions(): CookieOptions {
  const origin = process.env.ORIGIN || 'http://localhost:5173'
  const secure = origin.startsWith('https://')
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS
  }
}

export function setSessionCookie(res: Response, userId: string, withReauth = true): void {
  res.cookie(SESSION_COOKIE, createSessionToken(userId, withReauth), sessionCookieOptions())
}

export function setSessionTokenCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions())
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: sessionCookieOptions().secure,
    sameSite: 'lax',
    path: '/'
  })
}

export function hasValidReauth(payload: SessionPayload): boolean {
  return typeof payload.reauthExp === 'number' && payload.reauthExp > Date.now()
}
