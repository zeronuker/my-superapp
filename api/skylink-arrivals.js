/**
 * Vercel serverless proxy for SkyLink's airport arrival schedule endpoint
 * (up to a ~12-hour window).
 *
 * GET /api/skylink-arrivals?icao=<4-letter ICAO airport code>
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

export default async function handler(req, res) {
  const { icao } = req.query
  if (!icao) {
    return res.status(400).json({ error: 'icao query parameter is required' })
  }

  try {
    const upstream = await skylinkFetch('/schedules/arrivals', { icao: icao.trim().toUpperCase() }, 15_000)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink arrivals error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
