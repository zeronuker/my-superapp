const BASE = 'https://aviationweather.gov/api/data'
const ICAO_RE = /^[A-Z0-9]{3,4}(,[A-Z0-9]{3,4})*$/

export default async function handler(req, res) {
  const { ids, type, hours: hoursRaw = '3' } = req.query

  if (!ids || !type || !['metar', 'taf'].includes(type)) {
    return res.status(400).json({ error: 'ids and type (metar|taf) are required' })
  }

  const idsUpper = String(ids).toUpperCase()
  if (!ICAO_RE.test(idsUpper)) {
    return res.status(400).json({ error: 'ids must be ICAO codes (3-4 chars), comma-separated' })
  }

  const hours = Math.min(Math.max(parseInt(hoursRaw, 10) || 3, 1), 48)

  const url = `${BASE}/${type}?ids=${encodeURIComponent(idsUpper)}&format=json&hours=${hours}`

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(200).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'Weather API timed out' : String(e) })
  }
}
