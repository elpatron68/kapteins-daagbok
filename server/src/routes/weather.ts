import { Router } from 'express'
import { requireUser } from '../middleware/auth.js'

const router = Router()

function resolveOwmApiKey(userProvidedKey: unknown): string | null {
  if (typeof userProvidedKey === 'string' && userProvidedKey.trim()) {
    return userProvidedKey.trim()
  }
  const fromEnv =
    process.env.OpenWeatherMapAPIKey?.trim() ||
    process.env.OPENWEATHERMAP_API_KEY?.trim()
  return fromEnv || null
}

router.get('/current', requireUser, async (req, res) => {
  try {
    const { lat, lon, q } = req.query
    const apiKey = resolveOwmApiKey(req.headers['x-owm-api-key'])

    if (!apiKey) {
      return res.status(503).json({
        error: 'No OpenWeatherMap API key configured (user settings or server environment)'
      })
    }

    let url: URL
    if (lat && lon) {
      url = new URL('https://api.openweathermap.org/data/2.5/weather')
      url.searchParams.set('lat', String(lat))
      url.searchParams.set('lon', String(lon))
    } else if (q && typeof q === 'string' && q.trim()) {
      url = new URL('https://api.openweathermap.org/data/2.5/weather')
      url.searchParams.set('q', q.trim())
    } else {
      return res.status(400).json({ error: 'lat and lon, or q (location name) is required' })
    }

    url.searchParams.set('appid', apiKey)
    url.searchParams.set('units', 'metric')

    const owmRes = await fetch(url)
    const data = await owmRes.json()
    return res.status(owmRes.status).json(data)
  } catch (error: any) {
    console.error('Error fetching OpenWeatherMap data:', error)
    return res.status(502).json({ error: error.message || 'Weather lookup failed' })
  }
})

export default router
