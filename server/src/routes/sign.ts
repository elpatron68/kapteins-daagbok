import { Router } from 'express'
import crypto from 'crypto'
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'
import { prisma } from '../db.js'
import { requireUser } from '../middleware/auth.js'

const router = Router()

const rpID = process.env.RP_ID || 'localhost'
const origin = process.env.ORIGIN || 'http://localhost:5173'

const CHALLENGE_TTL_MS = 5 * 60 * 1000

interface SigningContext {
  userId: string
  logbookId: string
  entryId: string
  entryHash: string
  role: 'skipper' | 'crew'
  expiresAt: number
}

const signingChallenges = new Map<string, SigningContext>()

function pruneExpiredChallenges() {
  const now = Date.now()
  for (const [key, ctx] of signingChallenges) {
    if (ctx.expiresAt <= now) signingChallenges.delete(key)
  }
}

router.use(requireUser)

async function getLogbookWithAccess(logbookId: string, userId: string) {
  const logbook = await prisma.logbook.findUnique({
    where: { id: logbookId },
    include: {
      collaborators: {
        where: { userId }
      }
    }
  })
  if (!logbook) return null

  const isOwner = logbook.userId === userId
  const collaboration = logbook.collaborators[0]
  if (!isOwner && !collaboration) return null

  return { logbook, isOwner, collaboration }
}

function hasWriteAccess(access: { isOwner: boolean; collaboration?: { role: string } | null }) {
  // Intentional (HYBRID-ELECTRONIC-SIGNATURES.md §2.1): owner OR WRITE collaborator may sign entries.
  return access.isOwner || access.collaboration?.role === 'WRITE'
}

async function getAllowCredentialsForRole(
  logbookId: string,
  role: 'skipper' | 'crew',
  requestingUserId: string
) {
  if (role === 'skipper') {
    const credentials = await prisma.credential.findMany({
      where: { userId: requestingUserId }
    })
    return credentials.map((cred) => ({
      id: Buffer.from(cred.credentialId, 'base64url'),
      type: 'public-key' as const,
      transports: cred.transports as any[]
    }))
  }

  const collaborations = await prisma.collaboration.findMany({
    where: { logbookId, role: 'WRITE' },
    select: { userId: true }
  })

  const userIds = collaborations.map((c) => c.userId)
  if (userIds.length === 0) return []

  const credentials = await prisma.credential.findMany({
    where: { userId: { in: userIds } }
  })

  return credentials.map((cred) => ({
    id: Buffer.from(cred.credentialId, 'base64url'),
    type: 'public-key' as const,
    transports: cred.transports as any[]
  }))
}

async function isAuthorizedSigner(
  logbookId: string,
  ownerUserId: string,
  signerUserId: string,
  role: 'skipper' | 'crew'
): Promise<boolean> {
  if (role === 'skipper') {
    return signerUserId === ownerUserId
  }

  const collaboration = await prisma.collaboration.findUnique({
    where: {
      logbookId_userId: { logbookId, userId: signerUserId }
    }
  })
  return collaboration?.role === 'WRITE'
}

router.post('/options', async (req: any, res) => {
  try {
    pruneExpiredChallenges()

    const { logbookId, entryId, entryHash, role } = req.body
    if (!logbookId || !entryId || !entryHash || !role) {
      return res.status(400).json({ error: 'logbookId, entryId, entryHash and role are required' })
    }
    if (role !== 'skipper' && role !== 'crew') {
      return res.status(400).json({ error: 'role must be skipper or crew' })
    }

    const access = await getLogbookWithAccess(logbookId, req.userId)
    if (!access) {
      return res.status(403).json({ error: 'Forbidden: Access denied' })
    }

    if (!hasWriteAccess(access)) {
      return res.status(403).json({ error: 'Forbidden: WRITE access required to sign entries' })
    }

    const authorized = await isAuthorizedSigner(
      logbookId,
      access.logbook.userId,
      req.userId,
      role
    )
    if (!authorized) {
      return res.status(403).json({ error: 'Forbidden: Signer not authorized for this role' })
    }

    const allowCredentials = await getAllowCredentialsForRole(
      logbookId,
      role,
      req.userId
    )

    if (allowCredentials.length === 0) {
      return res.status(400).json({
        error: role === 'crew'
          ? 'No write collaborators with passkeys found'
          : 'No passkey credentials found for signer'
      })
    }

    const nonce = crypto.randomBytes(16).toString('hex')
    const challengePayload = `${entryId}:${entryHash}:${role}:${nonce}`
    const challengeBytes = crypto
      .createHash('sha256')
      .update(challengePayload)
      .digest()

    const options = await generateAuthenticationOptions({
      rpID,
      challenge: challengeBytes,
      allowCredentials,
      userVerification: 'required'
    })

    // Must key by options.challenge — the base64url value returned to the client.
    // Passing a string challenge would be UTF-8 re-encoded by simplewebauthn, so the
    // client challenge would not match a map key derived from our pre-encoded string.
    signingChallenges.set(options.challenge, {
      userId: req.userId,
      logbookId,
      entryId,
      entryHash,
      role,
      expiresAt: Date.now() + CHALLENGE_TTL_MS
    })

    return res.json(options)
  } catch (error: any) {
    console.error('Error generating sign options:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

router.post('/verify', async (req: any, res) => {
  try {
    pruneExpiredChallenges()

    const { credentialResponse, challenge, logbookId, entryId, entryHash, role } = req.body
    if (!credentialResponse || !challenge || !logbookId || !entryId || !entryHash || !role) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const context = signingChallenges.get(challenge)
    if (!context || context.expiresAt <= Date.now()) {
      return res.status(400).json({ error: 'Challenge not found or expired' })
    }

    if (
      context.logbookId !== logbookId ||
      context.entryId !== entryId ||
      context.entryHash !== entryHash ||
      context.role !== role
    ) {
      return res.status(400).json({ error: 'Signing context mismatch' })
    }

    const access = await getLogbookWithAccess(logbookId, req.userId)
    if (!access) {
      return res.status(403).json({ error: 'Forbidden: Access denied' })
    }

    if (!hasWriteAccess(access)) {
      return res.status(403).json({ error: 'Forbidden: WRITE access required to sign entries' })
    }

    const dbCred = await prisma.credential.findUnique({
      where: { credentialId: credentialResponse.id },
      include: { user: true }
    })

    if (!dbCred) {
      return res.status(400).json({ error: 'Credential not recognized' })
    }

    const authorized = await isAuthorizedSigner(
      logbookId,
      access.logbook.userId,
      dbCred.userId,
      role
    )
    if (!authorized) {
      return res.status(403).json({ error: 'Forbidden: Signer not authorized for this role' })
    }

    const verification = await verifyAuthenticationResponse({
      response: credentialResponse,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(dbCred.credentialId, 'base64url'),
        credentialPublicKey: dbCred.publicKey,
        counter: Number(dbCred.counter)
      }
    })

    if (!verification.verified || !verification.authenticationInfo) {
      return res.status(400).json({ error: 'Signature verification failed' })
    }

    signingChallenges.delete(challenge)

    await prisma.credential.update({
      where: { id: dbCred.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) }
    })

    return res.json({
      verified: true,
      userId: dbCred.user.id,
      username: dbCred.user.username,
      credentialId: dbCred.credentialId,
      signedAt: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Error verifying signature:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
