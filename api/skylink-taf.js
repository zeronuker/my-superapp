/**
 * Vercel serverless proxy for SkyLink's TAF endpoint.
 *
 * GET /api/skylink-taf?icao=<4-letter ICAO airport code>
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

export default async function handler(req, res) {
  const { icao } = req.query
  if (!icao) {
    return res.status(400).json({ error: 'icao query parameter is required' })
  }

  try {
    const upstream = await skylinkFetch(`/weather/taf/${encodeURIComponent(icao.trim().toUpperCase())}`, { parsed: false }, 8000)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink TAF error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
