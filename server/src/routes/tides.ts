import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'
import {
  fetchTidesForCoordinates,
  fetchTidesForPlace
} from '../utils/openMeteoTides.js'

const router = Router()

function parseLatLon(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  const latNum = Number(lat)
  const lonNum = Number(lon)
  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) return null
  if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) return null
  return { lat: latNum, lon: lonNum }
}

router.get('/nearby', requireUser, async (req, res) => {
  try {
    const coords = parseLatLon(req.query.lat, req.query.lon)
    if (!coords) {
      return res.status(400).json({ error: 'lat and lon are required' })
    }

    const data = await fetchTidesForCoordinates(coords.lat, coords.lon)
    return res.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Tide lookup failed'
    if (message === 'no_tide_data') {
      return res.status(404).json({ error: 'no_tide_data' })
    }
    console.error('Error fetching nearby tides:', error)
    return res.status(502).json({ error: message })
  }
})

router.get('/by-place', requireUser, async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!query) {
      return res.status(400).json({ error: 'q is required' })
    }

    const data = await fetchTidesForPlace(query)
    return res.json(data)
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    const message = error instanceof Error ? error.message : 'Tide lookup failed'
    if (status === 404 || message === 'place_not_found') {
      return res.status(404).json({ error: 'place_not_found' })
    }
    if (message === 'no_tide_data') {
      return res.status(404).json({ error: 'no_tide_data' })
    }
    console.error('Error fetching place tides:', error)
    return res.status(502).json({ error: message })
  }
})

export default router
