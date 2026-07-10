/**
 * Vercel serverless proxy for SkyLink's live ADS-B traffic endpoint.
 *
 * GET /api/skylink-adsb?lat=&lon=&radius=<nm>   — traffic within radius of a point
 * GET /api/skylink-adsb?icao24=<hex>            — single-aircraft refresh (used by PING)
 * GET /api/skylink-adsb?callsign=<partial>      — global search, no location needed —
 *   confirmed live: with no lat/lon/bbox filter this searches the whole ~9-10k-aircraft feed.
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

export default async function handler(req, res) {
  const { lat, lon, radius, icao24, callsign } = req.query

  if (!icao24 && !callsign && (!lat || !lon)) {
    return res.status(400).json({ error: 'lat and lon (or icao24, or callsign) are required' })
  }

  const params = {}
  if (icao24) params.icao24 = icao24
  if (callsign) params.callsign = callsign
  if (lat && lon) {
    params.lat = lat
    params.lon = lon
    // Our UI works in nautical miles; SkyLink's radius is kilometers.
    if (radius) params.radius = Math.round(Number(radius) * 1.852)
  }

  try {
    const upstream = await skylinkFetch('/adsb/aircraft', params, 10_000)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink ADS-B error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
