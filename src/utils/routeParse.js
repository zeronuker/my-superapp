// Pure helpers for the pasted-route feature (no React/DOM — also imported by
// api/route.js). A pilot pastes the route copied from FDPro/eWAS, e.g.
//   WMKK KIMAT1A KIMAT Y344 VPK M758 VISAT ... TOROX DCT RCQC
// parseRoute() reduces that to departure, arrival and the plain fixes;
// matchResolved() pairs autorouter's answer back to those fixes; and
// buildRouteLine() turns it into the points the map draws.

// The route function rejects more than this; keep in step with api/route.js.
export const MAX_FIXES = 60

/**
 * @param {string} text  pasted route
 * @returns {{ dep: string|null, arr: string|null, fixes: string[], ok: boolean, tooLong: boolean }}
 *   `ok` means both airports were found and the route is not too long.
 *   Airways, SIDs/STARs, runway tokens and DCT are dropped: anything with a
 *   digit is not a fix, and sending only fixes is what keeps autorouter from
 *   mixing up names that exist in several places (see CLAUDE.md).
 */
export function parseRoute(text) {
  const tokens = String(text ?? '')
    .toUpperCase()
    .split(/[\s,;]+/)
    .map(t => t.replace(/^[^A-Z0-9]+|[^A-Z0-9/]+$/g, '').split('/')[0])   // "KANKA/N0468F360" -> "KANKA"
    .filter(Boolean)

  const isAirport = t => /^[A-Z]{4}$/.test(t)
  const dep = tokens.length >= 2 && isAirport(tokens[0]) ? tokens[0] : null
  const arr = tokens.length >= 2 && isAirport(tokens.at(-1)) ? tokens.at(-1) : null

  const middle = tokens.slice(dep ? 1 : 0, arr ? -1 : undefined)
  const fixes = []
  for (const t of middle) {
    if (!/^[A-Z]{2,5}$/.test(t) || t === 'DCT') continue
    if (fixes.at(-1) === t) continue
    fixes.push(t)
  }

  const tooLong = fixes.length > MAX_FIXES
  return { dep, arr, fixes, ok: !!dep && !!arr && !tooLong, tooLong }
}

// Unknown names autorouter reported, e.g. "unknown identifier GORVU".
function unknownIdentifiers(error) {
  const lines = [].concat(error ?? []).flatMap(e => String(e).split('\n'))
  return new Set(lines.map(l => /unknown identifier (\S+)/i.exec(l)?.[1]).filter(Boolean))
}

/**
 * Pair autorouter's reply with the fixes that were sent.
 * The reply lists departure airport, every fix it knew (in order), arrival
 * airport; fixes it did not know are named in `error`.
 * @returns {Array<{name,lat,lon}|{name,missing:true}>|null}  null when the reply
 *   cannot be matched safely (wrong point count, no airports at the ends):
 *   better to draw nothing than a wrong line.
 */
export function matchResolved(fixes, reply) {
  const plan = (reply?.fplan ?? []).filter(w => w?.coordlatdeg != null && w?.coordlondeg != null)
  if (plan.length < 2 || plan[0].type !== 'ARPT' || plan.at(-1).type !== 'ARPT') return null

  const unknown = unknownIdentifiers(reply.error)
  const known = fixes.filter(f => !unknown.has(f))
  const interior = plan.slice(1, -1)
  if (interior.length !== known.length) return null

  let i = 0
  return fixes.map(name => (unknown.has(name)
    ? { name, missing: true }
    : { name, lat: interior[i].coordlatdeg, lon: interior[i++].coordlondeg }))
}

/**
 * Points the map draws: departure airport, the fixes in order, arrival airport.
 * A fix autorouter did not know is filled from `overrides` ({ IDENT: [lat, lon] })
 * when we have it, otherwise skipped and listed in `missing`.
 * @param {{lat:number,lng:number}} depPos
 * @param {{lat:number,lng:number}} arrPos
 */
export function buildRouteLine(depPos, arrPos, fixes, overrides = {}) {
  const points = [{ lat: depPos.lat, lng: depPos.lng }]
  const missing = []
  for (const f of fixes ?? []) {
    if (!f.missing) { points.push({ name: f.name, lat: f.lat, lng: f.lon }); continue }
    const o = overrides[f.name]
    if (o) points.push({ name: f.name, lat: o[0], lng: o[1] })
    else missing.push(f.name)
  }
  points.push({ lat: arrPos.lat, lng: arrPos.lng })
  return { points, missing }
}
