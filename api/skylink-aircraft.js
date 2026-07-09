/**
 * Vercel serverless proxy for SkyLink's aircraft lookup endpoint (static
 * registration/type/operator data — cacheable, unlike live position).
 *
 * GET /api/skylink-aircraft?registration=<reg>
 * GET /api/skylink-aircraft?icao24=<hex>
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

export default async function handler(req, res) {
  const { registration, icao24 } = req.query
  if (!registration && !icao24) {
    return res.status(400).json({ error: 'registration or icao24 query parameter is required' })
  }

  const path = registration
    ? `/aircraft/registration/${encodeURIComponent(registration.trim().toUpperCase())}`
    : `/aircraft/icao24/${encodeURIComponent(icao24.trim().toLowerCase())}`

  try {
    const upstream = await skylinkFetch(path, {}, 8000)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink aircraft lookup error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
