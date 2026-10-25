/**
 * Route service — positions of the fixes on a pasted route, via /api/route
 * (autorouter.aero). Parsing the pasted text is in utils/routeParse.js.
 */

import { parseRoute } from '../utils/routeParse'

/**
 * @param {{dep: string, arr: string, fixes: string[]}} route  from parseRoute()
 * @returns {Promise<Array<{name,lat,lon}|{name,missing:true}>>}  fixes in route order
 * @throws {Error} with a message fit to show the pilot
 */
export async function fetchRouteFixes({ dep, arr, fixes }) {
  const qs = new URLSearchParams({ dep, arr, fixes: fixes.join(',') })
  const r = await fetch(`/api/route?${qs}`, { signal: AbortSignal.timeout(15_000) })
  if (r.ok) return (await r.json()).fixes
  const body = await r.json().catch(() => null)
  throw new Error(body?.error || `Route lookup failed (HTTP ${r.status})`)
}

/**
 * For Briefing: look up the route pasted on the tab that opened it.
 * Never throws; resolves to { routeFixes } on success, { routeError } when the
 * lookup failed, or {} when there is nothing to look up (no pasted route, or
 * it does not match the Departure/Arrival boxes).
 */
export async function lookupRoute(route) {
  const p = parseRoute(route?.routeText)
  if (!p.ok || !p.fixes.length || p.dep !== route.dep || p.arr !== route.arr) return {}
  if (p.pts) return { routeFixes: p.pts }   // imported from an OFP: already positioned, nothing to look up
  try {
    return { routeFixes: await fetchRouteFixes(p) }
  } catch (e) {
    return { routeError: e?.message || 'Route lookup failed' }
  }
}
