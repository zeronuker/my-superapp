/**
 * Vercel serverless proxy for the autorouter.aero NOTAM API.
 * Data sourced from Eurocontrol EAD via INO (International NOTAM Operations).
 * Free, no API key required. End users of this app are the licensed recipients.
 *
 * GET /api/notam?icao=WMKK&pageSize=100
 */

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

  const pageSize  = Math.min(Math.max(parseInt(pageSizeRaw, 10) || 100, 1), 100)

  // Include NOTAMs valid from 1 hour ago onwards — catches active, future,
  // and very recently expired NOTAMs while excluding ancient history
  const startvalidity = Math.floor(Date.now() / 1000) - 3600

  const url =
    `https://api.autorouter.aero/v1.0/notam` +
    `?itemas=${encodeURIComponent(JSON.stringify([icaoUpper]))}` +
    `&limit=${pageSize}` +
    `&startvalidity=${startvalidity}`

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12_000) })

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `NOTAM API returned ${upstream.status} for ${icaoUpper}`,
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
