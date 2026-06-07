/**
 * Vercel serverless proxy for the Notamify NOTAM API.
 * Docs: https://skymerse.gitbook.io/notamify-api
 *
 * Required Vercel environment variable:
 *   NOTAMIFY_API_KEY – your Notamify API key (from the API Manager)
 *
 * GET /api/notam?icao=WMKK
 *
 * NOTE: Notamify bills per credit, so responses are edge-cached to limit usage.
 */

const NOTAM_URL = 'https://api.notamify.com/api/v2/notams'
const ICAO_RE   = /^[A-Z0-9]{2,6}$/

export default async function handler(req, res) {
  const { icao } = req.query

  if (!icao) {
    return res.status(400).json({ error: 'icao query parameter is required' })
  }

  const icaoUpper = String(icao).toUpperCase()
  if (!ICAO_RE.test(icaoUpper)) {
    return res.status(400).json({ error: 'icao must be 2–6 alphanumeric characters' })
  }

  const key = process.env.NOTAMIFY_API_KEY
  if (!key) {
    return res.status(503).json({ error: 'NOTAMIFY_API_KEY env var not set' })
  }

  // One ICAO per call (the client fans out), so no multi-location delimiter needed.
  const url = `${NOTAM_URL}?locations=${encodeURIComponent(icaoUpper)}`

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept:        'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({
        error:  `NOTAM API returned ${upstream.status} for ${icaoUpper}`,
        detail: text.slice(0, 200),
      })
    }

    const data = await upstream.json()
    // Edge-cache to conserve Notamify credits — NOTAMs change slowly.
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=900')
    return res.status(200).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'NOTAM API timed out' : String(e),
    })
  }
}
