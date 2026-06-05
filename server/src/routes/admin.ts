import { Router } from 'express'
import { prisma } from '../db.js'
import { requireUser, requireAdmin, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/me', requireUser, requireAdmin, (req, res) => {
  const { userId } = req as AuthedRequest
  res.json({ isAdmin: true, userId })
})

router.get('/summary', requireUser, requireAdmin, async (_req, res) => {
  try {
    const [totalUsers, totalLogbooks, totalPhotos, totalVoiceMemos, totalGpsTracks, totalCollaborations, totalInvitations, aiSummaryEntries] =
      await Promise.all([
        prisma.user.count(),
        prisma.logbook.count(),
        prisma.photoPayload.count(),
        prisma.voiceMemoPayload.count(),
        prisma.gpsTrackPayload.count(),
        prisma.collaboration.count(),
        prisma.invitation.count(),
        prisma.aiSummaryUsage.count()
      ])

    res.json({
      totalUsers,
      totalLogbooks,
      totalPhotos,
      totalVoiceMemos,
      totalGpsTracks,
      totalCollaborations,
      totalInvitations,
      aiSummaryEntries
    })
  } catch (error: unknown) {
    console.error('admin/summary error', error)
    res.status(500).json({ error: 'Failed to load admin summary' })
  }
})

type TimeBucket = 'day' | 'week' | 'month'

interface TimeSeriesPoint {
  date: string
  count: number
}

interface TimeSeries {
  metric: string
  points: TimeSeriesPoint[]
}

function normalizeBucket(value: string | undefined | null): TimeBucket {
  if (value === 'week' || value === 'month') return value
  return 'day'
}

function parseWindowDays(raw: string | undefined | null): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n) || n <= 0) return 90
  return Math.min(n, 365)
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - (day - 1))
  return d
}

function startOfMonth(date: Date): Date {
  const d = startOfDay(date)
  d.setUTCDate(1)
  return d
}

function bucketDate(date: Date, bucket: TimeBucket): string {
  const base =
    bucket === 'week' ? startOfWeek(date) : bucket === 'month' ? startOfMonth(date) : startOfDay(date)
  return base.toISOString().slice(0, 10)
}

async function buildTimeSeries(bucket: TimeBucket, windowDays: number): Promise<TimeSeries[]> {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - windowDays)

  const [users, logbooks, photos] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true }
    }),
    prisma.logbook.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true }
    }),
    prisma.photoPayload.findMany({
      where: { updatedAt: { gte: since } },
      select: { updatedAt: true }
    })
  ])

  function aggregate(dates: Date[], metric: string): TimeSeries {
    const map = new Map<string, number>()
    for (const d of dates) {
      const key = bucketDate(d, bucket)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    const points = Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, count]) => ({ date, count }))
    return { metric, points }
  }

  return [
    aggregate(
      users.map((u) => u.createdAt),
      'users_created'
    ),
    aggregate(
      logbooks.map((l) => l.createdAt),
      'logbooks_created'
    ),
    aggregate(
      photos.map((p) => p.updatedAt),
      'photos_updated'
    )
  ]
}

router.get('/timeseries', requireUser, requireAdmin, async (req, res) => {
  try {
    const bucket = normalizeBucket(typeof req.query.bucket === 'string' ? req.query.bucket : undefined)
    const windowDays = parseWindowDays(typeof req.query.window === 'string' ? req.query.window : undefined)

    const series = await buildTimeSeries(bucket, windowDays)
    res.json({ bucket, windowDays, series })
  } catch (error: unknown) {
    console.error('admin/timeseries error', error)
    res.status(500).json({ error: 'Failed to load admin time series' })
  }
})

export default router

