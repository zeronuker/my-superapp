/**
 * Vercel serverless proxy for SkyLink's flight status endpoint (schedule,
 * route, delay — only present when the callsign matches a scheduled flight).
 *
 * GET /api/skylink-flight-status?flight=<IATA or ICAO flight number>
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

export default async function handler(req, res) {
  const { flight } = req.query
  if (!flight) {
    return res.status(400).json({ error: 'flight query parameter is required' })
  }

  try {
    const upstream = await skylinkFetch(`/flight_status/${encodeURIComponent(flight.trim())}`, {}, 8000)
    if (upstream.status === 404) {
      // No scheduled flight matches this callsign — a normal outcome (GA/private traffic).
      return res.status(200).json(null)
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink flight status error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
