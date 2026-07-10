/**
 * Vercel serverless proxy for aviationweather.gov's international SIGMET
 * feed — confirmed live to have genuine global coverage (including
 * non-US FIRs), unlike the domestic-only airsigmet/pirep/g-airmet products
 * on the same API, which are US-only.
 *
 * GET /api/isigmet — returns every currently active international SIGMET
 * worldwide; the client filters by FIR since this endpoint takes no
 * location parameter.
 */
const BASE = 'https://aviationweather.gov/api/data'

export default async function handler(req, res) {
  try {
    const upstream = await fetch(`${BASE}/isigmet?format=json`, { signal: AbortSignal.timeout(10_000) })
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(200).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'SIGMET API timed out' : String(e) })
  }
}
