import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import authRouter from './routes/auth.js'
import logbooksRouter from './routes/logbooks.js'
import syncRouter from './routes/sync.js'
import collaborationRouter from './routes/collaboration.js'
import signRouter from './routes/sign.js'
import pushRouter from './routes/push.js'
import weatherRouter from './routes/weather.js'
import feedbackRouter from './routes/feedback.js'
import { prisma } from './db.js'
import { buildCorsOptions } from './cors.js'

/** Behind Nginx Proxy Manager. See docs/deployment/npm-security.md */
function configureTrustProxy(app: express.Express): void {
  const raw = process.env.TRUST_PROXY?.trim()
  if (raw === '1' || raw === 'true') {
    app.set('trust proxy', 1)
    return
  }
  if (raw) {
    app.set('trust proxy', raw)
    return
  }
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
  }
}

export function createApp(): express.Express {
  const app = express()

  configureTrustProxy(app)

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  )
  app.use(cors(buildCorsOptions()))
  app.use(cookieParser())
  app.use(express.json({ limit: '50mb' }))

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
  })

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })

  const publicCollaborationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
  })

  app.use('/api/auth', authLimiter)
  app.use('/api/collaboration/invite-details', publicCollaborationLimiter)
  app.use('/api/collaboration/share-pull', publicCollaborationLimiter)
  app.use('/api', apiLimiter)

  app.use('/api/auth', authRouter)
  app.use('/api/logbooks', logbooksRouter)
  app.use('/api/sync', syncRouter)
  app.use('/api/collaboration', collaborationRouter)
  app.use('/api/sign', signRouter)
  app.use('/api/push', pushRouter)
  app.use('/api/weather', weatherRouter)
  app.use('/api/feedback', feedbackRouter)

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        service: 'Kapteins Daagbok Backend'
      })
    } catch {
      res.status(500).json({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        service: 'Kapteins Daagbok Backend'
      })
    }
  })

  return app
}
