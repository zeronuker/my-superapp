/**
 * Vercel serverless proxy for AeroDataBox — used for airport runway data,
 * which SkyLink has none of.
 *
 * GET /api/aerodatabox?icao=<ICAO>   (runways)
 * GET /api/aerodatabox?iata=<IATA>   (runways)
 *
 * Required Vercel environment variable:
 *   AERODATABOX_API_KEY — the X-RapidAPI-Key from
 *   rapidapi.com/aedbx-aedbx/api/aerodatabox
 */

import { rateLimited } from './_rateLimit.js'

const BASE = 'https://aerodatabox.p.rapidapi.com'
const HOST = 'aerodatabox.p.rapidapi.com'

export default async function handler(req, res) {
  if (rateLimited(req, res)) return

  const { icao, iata } = req.query
  const apiKey = process.env.AERODATABOX_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AERODATABOX_API_KEY is not configured' })

  if (!icao && !iata) return res.status(400).json({ error: 'icao or iata query parameter is required' })
  const codeType = icao ? 'icao' : 'iata'
  const code = String(icao || iata).trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'icao/iata query parameter is required' })

  try {
    const upstream = await fetch(`${BASE}/airports/${codeType}/${encodeURIComponent(code)}/runways`, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST },
      signal: AbortSignal.timeout(8000),
    })
    if (upstream.status === 204) {
      // Don't apply the week-long runway cache to an empty/absent result —
      // a transient upstream gap shouldn't get stuck cached as "no data".
      res.setHeader('Cache-Control', 'no-store, no-cache')
      return res.status(200).json([])
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `AeroDataBox error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    // Runway layouts change rarely — cache a week to stay well within the free tier.
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000')
    return res.status(200).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'AeroDataBox API timed out' : String(e) })
  }
}
