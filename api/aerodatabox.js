/**
 * Vercel serverless proxy for AeroDataBox — used instead of SkyLink for the
 * two things SkyLink can't do: date-scoped flight status (SkyLink's
 * flight_status has no date param and was observed returning a stale
 * weeks-old record) and airport runway data (SkyLink has none at all).
 *
 * GET /api/aerodatabox?flight=<number>&date=<YYYY-MM-DD>   (flight status)
 * GET /api/aerodatabox?icao=<ICAO>                          (runways)
 * GET /api/aerodatabox?iata=<IATA>                          (runways)
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

  const { flight, date, icao, iata } = req.query

  let path, cacheControl
  if (flight) {
    if (!date) return res.status(400).json({ error: 'date query parameter is required' })
    path = `/flights/number/${encodeURIComponent(String(flight).trim())}/${encodeURIComponent(String(date).trim())}`
    path += `?${new URLSearchParams({ dateLocalRole: 'Both', withAircraftImage: 'false', withFlightPlan: 'false', withLocation: 'false' })}`
    cacheControl = 'no-store, no-cache'
  } else if (icao || iata) {
    const codeType = icao ? 'icao' : 'iata'
    const code = String(icao || iata).trim().toUpperCase()
    if (!code) return res.status(400).json({ error: 'icao/iata query parameter is required' })
    path = `/airports/${codeType}/${encodeURIComponent(code)}/runways`
    // Runway layouts change rarely — cache a week to stay well within the free tier.
    cacheControl = 'public, max-age=604800, stale-while-revalidate=2592000'
  } else {
    return res.status(400).json({ error: 'flight+date, or icao/iata, query parameters are required' })
  }

  const apiKey = process.env.AERODATABOX_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AERODATABOX_API_KEY is not configured' })

  try {
    const upstream = await fetch(`${BASE}${path}`, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST },
      signal: AbortSignal.timeout(8000),
    })
    if (upstream.status === 204) {
      // Don't apply the week-long runway cache to an empty/absent result —
      // a transient upstream gap shouldn't get stuck cached as "no data".
      res.setHeader('Cache-Control', 'no-store, no-cache')
      return res.status(200).json(flight ? null : [])
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `AeroDataBox error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', cacheControl)
    // Flight status: array response, flight number is unique per local date — take the first match.
    // Runways: array response, returned as-is.
    res.status(200).json(flight ? (Array.isArray(data) && data.length ? data[0] : null) : data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'AeroDataBox API timed out' : String(e) })
  }
}
