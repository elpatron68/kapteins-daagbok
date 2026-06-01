import { describe, it, expect, vi, beforeAll } from 'vitest'
import request from 'supertest'

vi.mock('./db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }])
  }
}))

const { createApp } = await import('./app.js')

describe('API smoke', () => {
  const app = createApp()

  beforeAll(() => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? 'test-session-secret-minimum-32-characters-long'
    process.env.ORIGIN = process.env.ORIGIN ?? 'http://localhost:5173'
    process.env.RP_ID = process.env.RP_ID ?? 'localhost'
  })

  it('GET /api/health returns ok when database is reachable', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.database).toBe('connected')
  })

  it('GET /api/logbooks requires session', async () => {
    const res = await request(app).get('/api/logbooks')
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Unauthorized/i)
  })

  it('POST /api/sync/push requires session', async () => {
    const res = await request(app)
      .post('/api/sync/push')
      .send({ items: [] })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Unauthorized/i)
  })

  it('GET /api/collaboration/invite-details requires token query', async () => {
    const res = await request(app).get('/api/collaboration/invite-details')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Token/i)
  })
})
