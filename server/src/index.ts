import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import logbooksRouter from './routes/logbooks.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// Mount routes
app.use('/api/auth', authRouter)
app.use('/api/logbooks', logbooksRouter)

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Kapteins Daagbox Backend'
  })
})

app.listen(PORT, () => {
  console.log(`[server] Server running on http://localhost:${PORT}`)
})
