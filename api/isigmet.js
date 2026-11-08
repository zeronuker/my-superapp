/**
 * Vercel serverless proxy for aviationweather.gov's international SIGMET
 * feed — confirmed live to have genuine global coverage (including
 * non-US FIRs), unlike the domestic-only airsigmet/pirep/g-airmet products
 * on the same API, which are US-only.
 *
 * GET /api/isigmet — returns every currently active international SIGMET
 * worldwide; the client filters by FIR since this endpoint takes no
 * location parameter.
 *
 * GET /api/isigmet?gdacs=list  — GDACS's list of current tropical cyclones
 * GET /api/isigmet?gdacs=<geometry URL> — one storm's geometry file
 * (Satellite tab, STORMS view.) GDACS now answers browsers with a bot-check page
 * (no CORS header, so the fetch fails), but answers plain server requests, so the
 * browser asks here instead. Only these two kinds of GDACS URL are fetched, never
 * an arbitrary one. Shares this function because the project is at Vercel's cap.
 */
import { rateLimited } from './_rateLimit.js'

const BASE = 'https://aviationweather.gov/api/data'
const GDACS_LIST = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP?eventlist=TC'
const GDACS_GEOMETRY = /^https:\/\/www\.gdacs\.org\/gdacsapi\/api\/polygons\/getgeometry\?eventtype=TC&eventid=\d+&episodeid=\d+$/

export function gdacsTarget(gdacs) {
  if (gdacs === 'list') return GDACS_LIST
  return GDACS_GEOMETRY.test(gdacs) ? gdacs : null
}

export default async function handler(req, res) {
  if (rateLimited(req, res)) return

  const gdacs = req.query?.gdacs
  const target = gdacs === undefined ? `${BASE}/isigmet?format=json` : gdacsTarget(String(gdacs))
  if (!target) return res.status(400).json({ error: 'gdacs must be "list" or a GDACS storm geometry URL' })
  const what = gdacs === undefined ? 'SIGMET' : 'Storm'

  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(gdacs === undefined ? 10_000 : 20_000) })
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(gdacs === undefined || upstream.ok ? 200 : 502).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? `${what} API timed out` : String(e) })
  }
}
