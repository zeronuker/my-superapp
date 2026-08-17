import { rateLimited } from './_rateLimit.js'

const BASE = 'https://aviationweather.gov/api/data'
const ICAO_RE = /^[A-Z0-9]{3,4}(,[A-Z0-9]{3,4})*$/

export default async function handler(req, res) {
  if (rateLimited(req, res)) return

  const { ids, type, hours: hoursRaw = '3' } = req.query

  if (!ids || !type || !['metar', 'taf'].includes(type)) {
    return res.status(400).json({ error: 'ids and type (metar|taf) are required' })
  }

  const idsUpper = String(ids).toUpperCase()
  if (!ICAO_RE.test(idsUpper)) {
    return res.status(400).json({ error: 'ids must be ICAO codes (3-4 chars), comma-separated' })
  }

  const hours = Math.min(Math.max(parseInt(hoursRaw, 10) || 3, 1), 48)

  // The TAF endpoint doesn't accept `hours` (it always returns the current
  // TAF) and 400s with a non-array error body if it's included — that error
  // object was slipping through as a 200 response and crashing the client's
  // .map() over what it assumed was an array of TAFs.
  const hoursParam = type === 'metar' ? `&hours=${hours}` : ''
  const url = `${BASE}/${type}?ids=${encodeURIComponent(idsUpper)}&format=json${hoursParam}`

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    // Forward the upstream's real status instead of assuming 200 — the
    // client relies on !r.ok to fall back to the backup weather source.
    res.status(upstream.ok ? 200 : 502).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'Weather API timed out' : String(e) })
  }
}
