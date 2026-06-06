import { Router } from 'express'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'
import { prisma } from '../db.js'
import { requireReauth, requireUser } from '../middleware/auth.js'
import {
  clearSessionCookie,
  extendReauth,
  readSessionFromRequest,
  setSessionCookie,
  setSessionTokenCookie
} from '../session.js'
import { ChallengeMap, ChallengeSet } from '../utils/challengeStore.js'
import { sendInternalError } from '../utils/httpErrors.js'

const router = Router()

const rpName = 'Kapteins Daagbok'
const rpID = process.env.RP_ID || 'localhost'
const origin = process.env.ORIGIN || 'http://localhost:5173'

const registrationChallenges = new ChallengeMap()
/** WebAuthn registration challenges for add-credential flow: challenge -> userId */
const addCredentialChallenges = new ChallengeSet<string>()
const activeChallenges = new ChallengeSet()

function previewCredentialId(credentialId: string): string {
  if (credentialId.length <= 16) return credentialId
  return `${credentialId.slice(0, 8)}…${credentialId.slice(-8)}`
}

function normalizeCredentialLabel(label: unknown): string | null {
  if (typeof label !== 'string') return null
  const trimmed = label.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 64)
}

const VALID_THEMES = new Set(['auto', 'ocean', 'material', 'cupertino'])
const VALID_COLOR_SCHEMES = new Set(['auto', 'light', 'dark'])

function parseThemePreference(value: unknown): string | null {
  return typeof value === 'string' && VALID_THEMES.has(value) ? value : null
}

function parseColorSchemePreference(value: unknown): string | null {
  return typeof value === 'string' && VALID_COLOR_SCHEMES.has(value) ? value : null
}

function isMissingAppearancePrefsTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2021'
  )
}

const DEFAULT_APPEARANCE_PREFS = {
  theme: 'auto',
  colorScheme: 'auto',
  aiAuthorized: false,
  persisted: false
} as const

router.post('/register-options', async (req, res) => {
  try {
    const { username } = req.body
    if (!username) {
      return res.status(400).json({ error: 'Username is required' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { username }
    })

    if (existingUser) {
      return res.status(400).json({ error: 'Could not start registration' })
    }

    const userID = Buffer.from(username, 'utf8').toString('base64url')

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID,
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred'
      },
      supportedAlgorithmIDs: [-7, -257]
    })

    registrationChallenges.set(username, options.challenge)

    return res.json(options)
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/register-options')
  }
})

router.post('/register-verify', async (req, res) => {
  try {
    const {
      username,
      credentialResponse,
      encryptedMasterKeyPrf,
      encryptedMasterKeyPrfIv,
      encryptedMasterKeyPrfTag,
      encryptedMasterKeyRec,
      encryptedMasterKeyRecIv,
      encryptedMasterKeyRecTag
    } = req.body

    if (!username || !credentialResponse) {
      return res.status(400).json({ error: 'Username and credentialResponse are required' })
    }

    const expectedChallenge = registrationChallenges.get(username)
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge not found or expired' })
    }

    const verification = await verifyRegistrationResponse({
      response: credentialResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID
    })

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'WebAuthn verification failed' })
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo

    const user = await prisma.user.create({
      data: {
        username,
        encryptedMasterKeyPrf,
        encryptedMasterKeyPrfIv,
        encryptedMasterKeyPrfTag,
        encryptedMasterKeyRec,
        encryptedMasterKeyRecIv,
        encryptedMasterKeyRecTag,
        credentials: {
          create: {
            credentialId: Buffer.from(credentialID).toString('base64url'),
            publicKey: Buffer.from(credentialPublicKey),
            counter: BigInt(counter),
            transports: credentialResponse.response.transports || []
          }
        }
      }
    })

    registrationChallenges.delete(username)
    setSessionCookie(res, user.id, true)

    return res.json({ verified: true, userId: user.id })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/register-verify')
  }
})

router.post('/login-options', async (req, res) => {
  try {
    const { username } = req.body

    let allowCredentials: any[] = []
    if (username) {
      const user = await prisma.user.findUnique({
        where: { username },
        include: { credentials: true }
      })
      if (user) {
        allowCredentials = user.credentials.map((cred) => ({
          id: Buffer.from(cred.credentialId, 'base64url'),
          type: 'public-key',
          transports: cred.transports as any[]
        }))
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred'
    })

    activeChallenges.add(options.challenge)

    return res.json(options)
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/login-options')
  }
})

router.post('/login-verify', async (req, res) => {
  try {
    const { credentialResponse, challenge } = req.body
    if (!credentialResponse || !challenge) {
      return res.status(400).json({ error: 'credentialResponse and challenge are required' })
    }

    if (!activeChallenges.has(challenge)) {
      return res.status(400).json({ error: 'Challenge not found or expired' })
    }
    activeChallenges.delete(challenge)

    const dbCred = await prisma.credential.findUnique({
      where: { credentialId: credentialResponse.id },
      include: { user: true }
    })

    if (!dbCred) {
      return res.status(400).json({ error: 'Credential not recognized' })
    }

    const user = dbCred.user

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
      return res.status(400).json({ error: 'Authentication failed' })
    }

    await prisma.credential.update({
      where: { id: dbCred.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) }
    })

    setSessionCookie(res, user.id, true)

    return res.json({
      verified: true,
      userId: user.id,
      username: user.username,
      encryptedMasterKeyPrf: user.encryptedMasterKeyPrf,
      encryptedMasterKeyPrfIv: user.encryptedMasterKeyPrfIv,
      encryptedMasterKeyPrfTag: user.encryptedMasterKeyPrfTag,
      encryptedMasterKeyRec: user.encryptedMasterKeyRec,
      encryptedMasterKeyRecIv: user.encryptedMasterKeyRecIv,
      encryptedMasterKeyRecTag: user.encryptedMasterKeyRecTag
    })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/login-verify')
  }
})

router.get('/session', (req, res) => {
  const session = readSessionFromRequest(req)
  if (!session) {
    return res.status(401).json({ authenticated: false })
  }
  return res.json({ authenticated: true, userId: session.userId })
})

router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  return res.json({ success: true })
})

router.post('/reauth-options', requireUser, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { credentials: true }
    })

    if (!user || user.credentials.length === 0) {
      return res.status(400).json({ error: 'No passkey credentials found' })
    }

    const allowCredentials = user.credentials.map((cred) => ({
      id: Buffer.from(cred.credentialId, 'base64url'),
      type: 'public-key' as const,
      transports: cred.transports as any[]
    }))

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'required'
    })

    activeChallenges.add(options.challenge)

    return res.json(options)
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/reauth-options')
  }
})

router.post('/reauth-verify', requireUser, async (req: any, res) => {
  try {
    const { credentialResponse, challenge } = req.body
    if (!credentialResponse || !challenge) {
      return res.status(400).json({ error: 'credentialResponse and challenge are required' })
    }

    if (!activeChallenges.has(challenge)) {
      return res.status(400).json({ error: 'Challenge not found or expired' })
    }
    activeChallenges.delete(challenge)

    const dbCred = await prisma.credential.findUnique({
      where: { credentialId: credentialResponse.id },
      include: { user: true }
    })

    if (!dbCred || dbCred.userId !== req.userId) {
      return res.status(403).json({ error: 'Credential does not belong to this account' })
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
      return res.status(400).json({ error: 'Reauthentication failed' })
    }

    await prisma.credential.update({
      where: { id: dbCred.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) }
    })

    const currentToken = req.cookies?.daagbok_session
    const extended = typeof currentToken === 'string' ? extendReauth(currentToken) : null
    if (extended) {
      setSessionTokenCookie(res, extended)
    } else {
      setSessionCookie(res, req.userId, true)
    }

    return res.json({ verified: true })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/reauth-verify')
  }
})

router.delete('/delete-account', requireReauth, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    await prisma.user.delete({
      where: { id: req.userId }
    })

    clearSessionCookie(res)
    return res.json({ success: true })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/delete-account')
  }
})

router.post('/enroll-prf', requireReauth, async (req: any, res) => {
  try {
    const { encryptedMasterKeyPrf, encryptedMasterKeyPrfIv, encryptedMasterKeyPrfTag } = req.body
    if (!encryptedMasterKeyPrf || !encryptedMasterKeyPrfIv || !encryptedMasterKeyPrfTag) {
      return res.status(400).json({ error: 'Missing required PRF key fields' })
    }

    if (
      typeof encryptedMasterKeyPrf !== 'string' ||
      typeof encryptedMasterKeyPrfIv !== 'string' ||
      typeof encryptedMasterKeyPrfTag !== 'string'
    ) {
      return res.status(400).json({ error: 'Invalid PRF key fields format' })
    }

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        encryptedMasterKeyPrf,
        encryptedMasterKeyPrfIv,
        encryptedMasterKeyPrfTag
      }
    })

    return res.json({ success: true })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/enroll-prf')
  }
})

router.post('/rotate-recovery', requireReauth, async (req: any, res) => {
  try {
    const { encryptedMasterKeyRec, encryptedMasterKeyRecIv, encryptedMasterKeyRecTag } = req.body
    if (!encryptedMasterKeyRec || !encryptedMasterKeyRecIv || !encryptedMasterKeyRecTag) {
      return res.status(400).json({ error: 'Missing required recovery key fields' })
    }

    if (
      typeof encryptedMasterKeyRec !== 'string' ||
      typeof encryptedMasterKeyRecIv !== 'string' ||
      typeof encryptedMasterKeyRecTag !== 'string'
    ) {
      return res.status(400).json({ error: 'Invalid recovery key fields format' })
    }

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        encryptedMasterKeyRec,
        encryptedMasterKeyRecIv,
        encryptedMasterKeyRecTag
      }
    })

    return res.json({ success: true })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/rotate-recovery')
  }
})

router.get('/appearance-prefs', requireUser, async (req: any, res) => {
  try {
    const prefs = await prisma.userAppearancePrefs.findUnique({
      where: { userId: req.userId }
    })

    return res.json({
      theme: prefs?.theme ?? 'auto',
      colorScheme: prefs?.colorScheme ?? 'auto',
      aiAuthorized: prefs?.aiAuthorized ?? false,
      persisted: prefs != null
    })
  } catch (error: unknown) {
    if (isMissingAppearancePrefsTable(error)) {
      console.warn('UserAppearancePrefs table missing — run: npx prisma db push (in server/)')
      return res.json({ ...DEFAULT_APPEARANCE_PREFS })
    }
    return sendInternalError(res, error, 'auth/appearance-prefs-get')
  }
})

router.put('/appearance-prefs', requireUser, async (req: any, res) => {
  try {
    const theme = parseThemePreference(req.body?.theme)
    const colorScheme = parseColorSchemePreference(req.body?.colorScheme)
    const aiAuthorized = req.body?.aiAuthorized === true
    if (!theme || !colorScheme) {
      return res.status(400).json({ error: 'Invalid theme or colorScheme' })
    }

    const prefs = await prisma.userAppearancePrefs.upsert({
      where: { userId: req.userId },
      create: {
        userId: req.userId,
        theme,
        colorScheme,
        aiAuthorized,
        updatedAt: new Date()
      },
      update: {
        theme,
        colorScheme,
        aiAuthorized,
        updatedAt: new Date()
      }
    })

    return res.json({
      theme: prefs.theme,
      colorScheme: prefs.colorScheme,
      aiAuthorized: prefs.aiAuthorized,
      persisted: true
    })
  } catch (error: unknown) {
    if (isMissingAppearancePrefsTable(error)) {
      console.warn('UserAppearancePrefs table missing — run: npx prisma db push (in server/)')
      return res.status(503).json({
        error: 'Appearance preferences storage is not migrated. Run prisma db push on the server.'
      })
    }
    return sendInternalError(res, error, 'auth/appearance-prefs-put')
  }
})

router.get('/person-pool', requireUser, async (req: any, res) => {
  try {
    const { hasCrewPoolPrismaModels, isMissingPrismaTable, CREW_POOL_MIGRATION_HINT } =
      await import('../utils/crewPoolSchema.js')
    if (!hasCrewPoolPrismaModels()) {
      console.warn('Person pool Prisma models missing — run prisma generate')
      return res.status(503).json({ error: CREW_POOL_MIGRATION_HINT, persons: [] })
    }
    const persons = await prisma.personPayload.findMany({
      where: { userId: req.userId }
    })
    return res.json({ persons })
  } catch (error: unknown) {
    const { isMissingPrismaTable, CREW_POOL_MIGRATION_HINT } = await import('../utils/crewPoolSchema.js')
    if (isMissingPrismaTable(error)) {
      return res.status(503).json({ error: CREW_POOL_MIGRATION_HINT, persons: [] })
    }
    return sendInternalError(res, error, 'auth/person-pool-get')
  }
})

router.post('/person-pool/push', requireUser, async (req: any, res) => {
  try {
    const { hasCrewPoolPrismaModels, isMissingPrismaTable, CREW_POOL_MIGRATION_HINT } =
      await import('../utils/crewPoolSchema.js')
    if (!hasCrewPoolPrismaModels()) {
      return res.status(503).json({ error: CREW_POOL_MIGRATION_HINT })
    }

    const { items } = req.body
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' })
    }

    const results: Array<{ payloadId: string; status: string; error?: string; reason?: string }> = []

    for (const item of items) {
      const { action, payloadId, data, updatedAt } = item
      const itemUpdatedAt = new Date(updatedAt)

      try {
        if (action === 'delete') {
          await prisma.personPayload.deleteMany({
            where: { userId: req.userId, payloadId }
          })
          results.push({ payloadId, status: 'success' })
          continue
        }

        const parsed = JSON.parse(data)
        const encryptedData = parsed.encryptedData || parsed.ciphertext
        const { iv, tag } = parsed

        const existing = await prisma.personPayload.findUnique({
          where: { userId_payloadId: { userId: req.userId, payloadId } }
        })
        if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
          results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
          continue
        }

        await prisma.personPayload.upsert({
          where: { userId_payloadId: { userId: req.userId, payloadId } },
          create: {
            userId: req.userId,
            payloadId,
            encryptedData,
            iv,
            tag,
            updatedAt: itemUpdatedAt
          },
          update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
        })
        results.push({ payloadId, status: 'success' })
      } catch (err: any) {
        results.push({ payloadId, status: 'error', error: err.message || 'Operation failed' })
      }
    }

    return res.json({ results })
  } catch (error: unknown) {
    const { isMissingPrismaTable, CREW_POOL_MIGRATION_HINT } = await import('../utils/crewPoolSchema.js')
    if (isMissingPrismaTable(error)) {
      return res.status(503).json({ error: CREW_POOL_MIGRATION_HINT })
    }
    return sendInternalError(res, error, 'auth/person-pool-push')
  }
})

router.get('/vessel-pool', requireUser, async (req: any, res) => {
  try {
    const { hasVesselPoolPrismaModels, isMissingPrismaTable, VESSEL_POOL_MIGRATION_HINT } =
      await import('../utils/crewPoolSchema.js')
    if (!hasVesselPoolPrismaModels()) {
      console.warn('Vessel pool Prisma models missing — run prisma generate')
      return res.status(503).json({ error: VESSEL_POOL_MIGRATION_HINT, vessels: [] })
    }
    const vessels = await prisma.vesselPayload.findMany({
      where: { userId: req.userId }
    })
    return res.json({ vessels })
  } catch (error: unknown) {
    const { isMissingPrismaTable, VESSEL_POOL_MIGRATION_HINT } = await import('../utils/crewPoolSchema.js')
    if (isMissingPrismaTable(error)) {
      return res.status(503).json({ error: VESSEL_POOL_MIGRATION_HINT, vessels: [] })
    }
    return sendInternalError(res, error, 'auth/vessel-pool-get')
  }
})

router.post('/vessel-pool/push', requireUser, async (req: any, res) => {
  try {
    const { hasVesselPoolPrismaModels, isMissingPrismaTable, VESSEL_POOL_MIGRATION_HINT } =
      await import('../utils/crewPoolSchema.js')
    if (!hasVesselPoolPrismaModels()) {
      return res.status(503).json({ error: VESSEL_POOL_MIGRATION_HINT })
    }

    const { items } = req.body
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' })
    }

    const results: Array<{ payloadId: string; status: string; error?: string; reason?: string }> = []

    for (const item of items) {
      const { action, payloadId, data, updatedAt } = item
      const itemUpdatedAt = new Date(updatedAt)

      try {
        if (action === 'delete') {
          await prisma.vesselPayload.deleteMany({
            where: { userId: req.userId, payloadId }
          })
          results.push({ payloadId, status: 'success' })
          continue
        }

        const parsed = JSON.parse(data)
        const encryptedData = parsed.encryptedData || parsed.ciphertext
        const { iv, tag } = parsed

        const existing = await prisma.vesselPayload.findUnique({
          where: { userId_payloadId: { userId: req.userId, payloadId } }
        })
        if (existing && new Date(existing.updatedAt) > itemUpdatedAt) {
          results.push({ payloadId, status: 'conflict', reason: 'Server version is newer' })
          continue
        }

        await prisma.vesselPayload.upsert({
          where: { userId_payloadId: { userId: req.userId, payloadId } },
          create: {
            userId: req.userId,
            payloadId,
            encryptedData,
            iv,
            tag,
            updatedAt: itemUpdatedAt
          },
          update: { encryptedData, iv, tag, updatedAt: itemUpdatedAt }
        })
        results.push({ payloadId, status: 'success' })
      } catch (err: any) {
        results.push({ payloadId, status: 'error', error: err.message || 'Operation failed' })
      }
    }

    return res.json({ results })
  } catch (error: unknown) {
    const { isMissingPrismaTable, VESSEL_POOL_MIGRATION_HINT } = await import('../utils/crewPoolSchema.js')
    if (isMissingPrismaTable(error)) {
      return res.status(503).json({ error: VESSEL_POOL_MIGRATION_HINT })
    }
    return sendInternalError(res, error, 'auth/vessel-pool-push')
  }
})

router.get('/profile', requireUser, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        credentials: {
          orderBy: { id: 'asc' }
        },
        _count: {
          select: {
            logbooks: true,
            collaborations: true
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({
      userId: user.id,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      hasPrfEncryption: user.encryptedMasterKeyPrf != null,
      credentials: user.credentials.map((cred) => ({
        id: cred.id,
        label: cred.label,
        credentialIdPreview: previewCredentialId(cred.credentialId),
        transports: cred.transports
      })),
      serverMeta: {
        ownedLogbookCount: user._count.logbooks,
        collaborationCount: user._count.collaborations
      }
    })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/profile')
  }
})

router.post('/add-credential-options', requireReauth, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { credentials: true }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const userID = Buffer.from(user.username, 'utf8').toString('base64url')
    const excludeCredentials = user.credentials.map((cred) => ({
      id: Buffer.from(cred.credentialId, 'base64url'),
      type: 'public-key' as const,
      transports: cred.transports as any[]
    }))

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID,
      userName: user.username,
      userDisplayName: user.username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred'
      },
      supportedAlgorithmIDs: [-7, -257],
      excludeCredentials
    })

    addCredentialChallenges.add(options.challenge, req.userId)

    return res.json(options)
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/add-credential-options')
  }
})

router.post('/add-credential-verify', requireReauth, async (req: any, res) => {
  try {
    const { credentialResponse, challenge } = req.body
    if (!credentialResponse || !challenge) {
      return res.status(400).json({ error: 'credentialResponse and challenge are required' })
    }

    const label = normalizeCredentialLabel(req.body.label)

    const challengeUserId = addCredentialChallenges.get(challenge)
    if (!challengeUserId) {
      return res.status(400).json({ error: 'Challenge not found or expired' })
    }

    if (challengeUserId !== req.userId) {
      return res.status(403).json({ error: 'Challenge does not belong to this account' })
    }

    // Single-use: invalidate before verification so failed attempts cannot be retried
    addCredentialChallenges.delete(challenge)

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const verification = await verifyRegistrationResponse({
      response: credentialResponse,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID
    })

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'WebAuthn verification failed' })
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo
    const credentialId = Buffer.from(credentialID).toString('base64url')

    const existing = await prisma.credential.findUnique({
      where: { credentialId }
    })
    if (existing) {
      return res.status(400).json({ error: 'Credential already registered' })
    }

    const credential = await prisma.credential.create({
      data: {
        userId: req.userId,
        credentialId,
        label,
        publicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
        transports: credentialResponse.response.transports || []
      }
    })

    return res.json({
      verified: true,
      credential: {
        id: credential.id,
        label: credential.label,
        credentialIdPreview: previewCredentialId(credential.credentialId),
        transports: credential.transports
      }
    })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/add-credential-verify')
  }
})

router.patch('/credentials/:id', requireReauth, async (req: any, res) => {
  try {
    const { id } = req.params
    const label = normalizeCredentialLabel(req.body?.label)

    const credential = await prisma.credential.findUnique({
      where: { id }
    })

    if (!credential || credential.userId !== req.userId) {
      return res.status(404).json({ error: 'Credential not found' })
    }

    const updated = await prisma.credential.update({
      where: { id },
      data: { label }
    })

    return res.json({
      credential: {
        id: updated.id,
        label: updated.label,
        credentialIdPreview: previewCredentialId(updated.credentialId),
        transports: updated.transports
      }
    })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/credentials-patch')
  }
})

router.delete('/credentials/:id', requireReauth, async (req: any, res) => {
  try {
    const { id } = req.params

    const credential = await prisma.credential.findUnique({
      where: { id }
    })

    if (!credential || credential.userId !== req.userId) {
      return res.status(404).json({ error: 'Credential not found' })
    }

    const credentialCount = await prisma.credential.count({
      where: { userId: req.userId }
    })

    if (credentialCount <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last passkey' })
    }

    await prisma.credential.delete({
      where: { id }
    })

    return res.json({ success: true })
  } catch (error: unknown) {
    return sendInternalError(res, error, 'auth/credentials-delete')
  }
})

export default router
