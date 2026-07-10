/**
 * Vercel serverless proxy for SkyLink's airline lookup endpoint (name, IATA/
 * ICAO codes, country, callsign, logo — keyed by the airline_code the
 * aircraft-lookup endpoint already returns).
 *
 * GET /api/skylink-airlines?icao=<3-letter ICAO airline code>
 * GET /api/skylink-airlines?iata=<2-letter IATA airline code>
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

export default async function handler(req, res) {
  const { icao, iata } = req.query
  if (!icao && !iata) {
    return res.status(400).json({ error: 'icao or iata query parameter is required' })
  }

  const params = {}
  if (icao) params.icao = icao.trim().toUpperCase()
  if (iata) params.iata = iata.trim().toUpperCase()

  try {
    const upstream = await skylinkFetch('/airlines/search', params, 8000)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink airlines error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
