/**
 * Vercel serverless proxy: positions of the fixes on a pasted route, from autorouter.aero.
 *
 * Required Vercel environment variables (same as /api/notam):
 *   AUTOROUTER_EMAIL / AUTOROUTER_PASSWORD
 *
 * GET /api/route?dep=WMKK&arr=RCQC&fixes=KIMAT,VPK,VISAT
 *
 * Only the fixes are sent (airways, SIDs and STARs are dropped by the app):
 * autorouter does not know the Asian airways, and sending them made it mix up
 * names that exist in several places. The flight plan text is built here from
 * validated fields, never from pasted text, and it is only parsed, never filed.
 * Fix positions barely change, so answers are cached for a day.
 */

import { rateLimited } from './_rateLimit.js'
import { getToken, invalidateToken } from './_autorouterToken.js'
import { matchResolved, MAX_FIXES } from '../src/utils/routeParse.js'

const FPLAN_URL = 'https://api.autorouter.aero/v1.0/flightplan'
const AIRPORT_RE = /^[A-Z]{4}$/
const FIX_RE = /^[A-Z]{2,5}$/

const buildFpl = (dep, arr, fixes) =>
  `(FPL-MXD100-IS\n-B38M/M-SDFGHIRWY/LB1\n-${dep}0020\n-N0450F350 ${fixes.join(' DCT ')}\n-${arr}0430\n-PBN/A1B1C1D1O1S2T1)`

function postPlan(token, fpl) {
  return fetch(FPLAN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fpl }),
    signal: AbortSignal.timeout(12_000),
  })
}

export default async function handler(req, res) {
  if (rateLimited(req, res, { limit: 30, windowMs: 60_000 })) return

  const dep = String(req.query.dep ?? '').toUpperCase()
  const arr = String(req.query.arr ?? '').toUpperCase()
  const fixes = String(req.query.fixes ?? '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean)

  if (!AIRPORT_RE.test(dep) || !AIRPORT_RE.test(arr)) {
    return res.status(400).json({ error: 'dep and arr must be 4-letter ICAO codes' })
  }
  if (!fixes.length) return res.status(400).json({ error: 'fixes query parameter is required' })
  if (fixes.length > MAX_FIXES) return res.status(400).json({ error: `at most ${MAX_FIXES} fixes` })
  if (!fixes.every(f => FIX_RE.test(f))) {
    return res.status(400).json({ error: 'each fix must be 2–5 letters' })
  }

  try {
    const fpl = buildFpl(dep, arr, fixes)
    let r = await postPlan(await getToken(), fpl)
    if (r.status === 401) {       // token was invalidated: log in again, once
      invalidateToken()
      r = await postPlan(await getToken(), fpl)
    }
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      console.error(`[route] upstream failed ${r.status}: ${text.slice(0, 200)}`)
      return res.status(r.status).json({ error: `Route lookup returned ${r.status}` })
    }

    const resolved = matchResolved(fixes, await r.json())
    if (!resolved) {
      console.error(`[route] could not match reply for ${dep}-${arr} (${fixes.length} fixes)`)
      return res.status(502).json({ error: 'Could not match the route lookup to your fixes' })
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    return res.status(200).json({ fixes: resolved })
  } catch (e) {
    if (/OAuth|env vars|login limit/i.test(e.message)) {
      console.error(`[route] getToken failed: ${e.message}`)
      return res.status(503).json({ error: `Auth error: ${e.message}` })
    }
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    console.error(`[route] ${isTimeout ? 'timeout' : 'fetch error'}: ${e}`)
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'Route lookup timed out' : String(e),
    })
  }
}
