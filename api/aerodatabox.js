/**
 * Vercel serverless proxy for AeroDataBox's date-scoped flight-status
 * endpoint — used instead of SkyLink's flight_status lookup, which has no
 * date parameter at all and was observed returning a stale (weeks-old)
 * schedule record for a live flight. AeroDataBox lets us ask for a specific
 * local date, so we control which day's instance we get back.
 *
 * GET /api/aerodatabox?flight=<number>&date=<YYYY-MM-DD>
 *
 * Required Vercel environment variable:
 *   AERODATABOX_API_KEY — the X-RapidAPI-Key from
 *   rapidapi.com/aedbx-aedbx/api/aerodatabox
 */

const BASE = 'https://aerodatabox.p.rapidapi.com'
const HOST = 'aerodatabox.p.rapidapi.com'

export default async function handler(req, res) {
  const { flight, date } = req.query
  if (!flight) return res.status(400).json({ error: 'flight query parameter is required' })
  if (!date) return res.status(400).json({ error: 'date query parameter is required' })

  const apiKey = process.env.AERODATABOX_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AERODATABOX_API_KEY is not configured' })

  const path = `/flights/number/${encodeURIComponent(String(flight).trim())}/${encodeURIComponent(String(date).trim())}`
  const qs = new URLSearchParams({
    dateLocalRole: 'Both', withAircraftImage: 'false', withFlightPlan: 'false', withLocation: 'false',
  })

  try {
    const upstream = await fetch(`${BASE}${path}?${qs}`, {
      headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST },
      signal: AbortSignal.timeout(8000),
    })
    if (upstream.status === 204) {
      res.setHeader('Cache-Control', 'no-store, no-cache')
      return res.status(200).json(null)
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `AeroDataBox error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    // Flight number is unique per local date — take the first match.
    res.status(200).json(Array.isArray(data) && data.length ? data[0] : null)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'AeroDataBox API timed out' : String(e) })
  }
}
