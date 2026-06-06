/**
 * Vercel serverless proxy for the FAA NOTAM Search API.
 * Avoids CORS restrictions on direct browser fetches.
 * Docs: https://notamapi.faa.gov/
 *
 * GET /api/notam?icao=WMKK&pageSize=100
 */

const BASE    = 'https://notamapi.faa.gov/api/v2'
const ICAO_RE = /^[A-Z0-9]{2,6}$/

export default async function handler(req, res) {
  const { icao, pageSize: pageSizeRaw = '100' } = req.query

  if (!icao) {
    return res.status(400).json({ error: 'icao query parameter is required' })
  }

  const icaoUpper = String(icao).toUpperCase()
  if (!ICAO_RE.test(icaoUpper)) {
    return res.status(400).json({ error: 'icao must be 2–6 alphanumeric characters' })
  }

  const pageSize = Math.min(Math.max(parseInt(pageSizeRaw, 10) || 100, 1), 200)
  const url = `${BASE}/notams?icaoLocation=${icaoUpper}&pageSize=${pageSize}`

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12_000) })

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `FAA NOTAM API returned ${upstream.status}`,
      })
    }

    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300') // 5-min cache
    return res.status(200).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'NOTAM API timed out' : String(e),
    })
  }
}
