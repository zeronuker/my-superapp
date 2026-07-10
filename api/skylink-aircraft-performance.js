/**
 * Vercel serverless proxy for SkyLink's aircraft performance endpoint (engine
 * type, wake category, cruise speed, range, dimensions, MTOW — keyed by the
 * icao_type the aircraft-lookup endpoint already returns).
 *
 * GET /api/skylink-aircraft-performance?icao_type=<ICAO type code, e.g. B77W>
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

export default async function handler(req, res) {
  const { icao_type } = req.query
  if (!icao_type) {
    return res.status(400).json({ error: 'icao_type query parameter is required' })
  }

  try {
    const upstream = await skylinkFetch(`/aircraft/performance/${encodeURIComponent(icao_type.trim().toUpperCase())}`, {}, 8000)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink aircraft performance error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
