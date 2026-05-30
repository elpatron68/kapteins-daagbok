import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const __dirname = dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: resolve(__dirname, '../../.env') })
dotenv.config({ path: resolve(__dirname, '../.env') })

const app = express()
const PORT = process.env.PORT || 5000

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
)
app.use(cors(buildCorsOptions()))
app.use(cookieParser())
// Encrypted sync payloads (photos, GPS tracks) can be large — align with nginx client_max_body_size
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

app.use('/api/auth', authLimiter)
app.use('/api', apiLimiter)

// Mount routes
app.use('/api/auth', authRouter)
app.use('/api/logbooks', logbooksRouter)
app.use('/api/sync', syncRouter)
app.use('/api/collaboration', collaborationRouter)
app.use('/api/sign', signRouter)
app.use('/api/push', pushRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/feedback', feedbackRouter)

// Health check endpoint
app.get('/api/health', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`[server] Server running on http://localhost:${PORT}`)
})
