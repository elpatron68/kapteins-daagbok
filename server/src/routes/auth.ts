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

const router = Router()

const rpName = 'Kapteins Daagbok'
const rpID = process.env.RP_ID || 'localhost'
const origin = process.env.ORIGIN || 'http://localhost:5173'

const registrationChallenges = new Map<string, string>()
const addCredentialChallenges = new Map<string, string>()
const activeChallenges = new Set<string>()

function previewCredentialId(credentialId: string): string {
  if (credentialId.length <= 16) return credentialId
  return `${credentialId.slice(0, 8)}…${credentialId.slice(-8)}`
}

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
      return res.status(400).json({ error: 'User already exists' })
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
  } catch (error: any) {
    console.error('Error generating registration options:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error verifying registration response:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error generating authentication options:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error verifying authentication response:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error generating reauth options:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error verifying reauth:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error deleting account:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error enrolling PRF key:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
        credentialIdPreview: previewCredentialId(cred.credentialId),
        transports: cred.transports
      })),
      serverMeta: {
        ownedLogbookCount: user._count.logbooks,
        collaborationCount: user._count.collaborations
      }
    })
  } catch (error: any) {
    console.error('Error fetching user profile:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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

    addCredentialChallenges.set(req.userId, options.challenge)

    return res.json(options)
  } catch (error: any) {
    console.error('Error generating add-credential options:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

router.post('/add-credential-verify', requireReauth, async (req: any, res) => {
  try {
    const { credentialResponse } = req.body
    if (!credentialResponse) {
      return res.status(400).json({ error: 'credentialResponse is required' })
    }

    const expectedChallenge = addCredentialChallenges.get(req.userId)
    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge not found or expired' })
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
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
        publicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
        transports: credentialResponse.response.transports || []
      }
    })

    addCredentialChallenges.delete(req.userId)

    return res.json({
      verified: true,
      credential: {
        id: credential.id,
        credentialIdPreview: previewCredentialId(credential.credentialId),
        transports: credential.transports
      }
    })
  } catch (error: any) {
    console.error('Error verifying add-credential response:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
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
  } catch (error: any) {
    console.error('Error deleting credential:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

export default router
