import { Router } from 'express'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'
import { prisma } from '../db.js'

const router = Router()

const rpName = 'Kapteins Daagbox'
const rpID = process.env.RP_ID || 'localhost'
const origin = process.env.ORIGIN || 'http://localhost:5173'

// In-memory challenge stores
const registrationChallenges = new Map<string, string>()
const authenticationChallenges = new Map<string, { challenge: string; userId: string }>()
const activeChallenges = new Set<string>()

// 1. Generate Registration Options
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

    // NOTE: @simplewebauthn/server v9 places `userID` verbatim into the
    // emitted `user.id` JSON field. The browser client (v13) however decodes
    // `user.id` as a base64url string. Passing a raw username therefore either
    // corrupts the user handle or, for usernames containing characters outside
    // the base64url alphabet (".", " ", "@", umlauts, ...), makes the browser
    // throw "Invalid character" before the passkey prompt even appears.
    // Encoding the username as base64url keeps the value spec-compliant.
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
      supportedAlgorithmIDs: [-7, -257] // ES256 and RS256
    })

    // Store challenge
    registrationChallenges.set(username, options.challenge)

    return res.json(options)
  } catch (error: any) {
    console.error('Error generating registration options:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 2. Verify Registration Response
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

    // Save user and credential
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

    return res.json({ verified: true, userId: user.id })
  } catch (error: any) {
    console.error('Error verifying registration response:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 3. Generate Authentication Options
router.post('/login-options', async (req, res) => {
  try {
    const { username } = req.body

    // If username is supplied, we do a targeted login, otherwise usernameless
    let allowCredentials: any[] = []
    if (username) {
      const user = await prisma.user.findUnique({
        where: { username },
        include: { credentials: true }
      })
      if (user) {
        allowCredentials = user.credentials.map(cred => ({
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

    // Store challenge
    activeChallenges.add(options.challenge)

    return res.json(options)
  } catch (error: any) {
    console.error('Error generating authentication options:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 4. Verify Authentication Response
router.post('/login-verify', async (req, res) => {
  try {
    const { credentialResponse, challenge } = req.body
    if (!credentialResponse || !challenge) {
      return res.status(400).json({ error: 'credentialResponse and challenge are required' })
    }

    // Verify challenge
    if (!activeChallenges.has(challenge)) {
      return res.status(400).json({ error: 'Challenge not found or expired' })
    }
    activeChallenges.delete(challenge)

    // Find the credential in DB
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

    // Update counter
    await prisma.credential.update({
      where: { id: dbCred.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) }
    })

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

// 5. Delete own account
router.delete('/delete-account', async (req: any, res) => {
  try {
    const userId = req.headers['x-user-id']
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: X-User-Id header missing' })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    await prisma.user.delete({
      where: { id: userId }
    })

    return res.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting account:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 6. Enroll PRF encrypted master key
router.post('/enroll-prf', async (req: any, res) => {
  try {
    const userId = req.headers['x-user-id']
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: X-User-Id header missing' })
    }

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
      where: { id: userId },
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

export default router
