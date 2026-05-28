import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import logbooksRouter from './routes/logbooks.js'
import syncRouter from './routes/sync.js'
import { prisma } from './db.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// Mount routes
app.use('/api/auth', authRouter)
app.use('/api/logbooks', logbooksRouter)
app.use('/api/sync', syncRouter)

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      service: 'Kapteins Daagbox Backend'
    })
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
      service: 'Kapteins Daagbox Backend'
    })
  }
})

app.listen(PORT, () => {
  console.log(`[server] Server running on http://localhost:${PORT}`)
})
