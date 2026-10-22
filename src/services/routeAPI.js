/**
 * Route service — positions of the fixes on a pasted route, via /api/route
 * (autorouter.aero). Parsing the pasted text is in utils/routeParse.js.
 */

/**
 * @param {{dep: string, arr: string, fixes: string[]}} route  from parseRoute()
 * @returns {Promise<Array<{name,lat,lon}|{name,missing:true}>>}  fixes in route order
 * @throws {Error} with a message fit to show the pilot
 */
export async function fetchRouteFixes({ dep, arr, fixes }) {
  const qs = new URLSearchParams({ dep, arr, fixes: fixes.join(',') })
  const r = await fetch(`/api/route?${qs}`, { signal: AbortSignal.timeout(20_000) })
  if (r.ok) return (await r.json()).fixes
  const body = await r.json().catch(() => null)
  throw new Error(body?.error || `Route lookup failed (HTTP ${r.status})`)
}
