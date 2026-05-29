import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import logbooksRouter from './routes/logbooks.js'
import syncRouter from './routes/sync.js'
import collaborationRouter from './routes/collaboration.js'
import signRouter from './routes/sign.js'
import { prisma } from './db.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Mount routes
app.use('/api/auth', authRouter)
app.use('/api/logbooks', logbooksRouter)
app.use('/api/sync', syncRouter)
app.use('/api/collaboration', collaborationRouter)
app.use('/api/sign', signRouter)

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
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
      service: 'Kapteins Daagbok Backend'
    })
  }
})

app.listen(PORT, () => {
  console.log(`[server] Server running on http://localhost:${PORT}`)
})
