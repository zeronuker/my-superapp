// Pure readers for the company OFP (no React/DOM — vitest runs in node).
// Two formats carry the same flight: the XmlOFP (ARINC 633 XML) and the PFP
// PDF, whose text pdfText.js turns into lines. Both contain the filed ICAO
// flight plan and the "ENROUTE ALT" remark as plain text, so one reader serves
// both; only the route points differ.
//
// parseOfpXml(text) / parseOfpPdf(lines) -> { ok: true, flight, dep, arr,
//   destAlts, enrouteAlts, points: [{name, lat, lon}] } | { ok: false, error }
// ofpToFields() shapes that for a tab's boxes; ofpRouteText() writes the points
// into the route text as NAME:lat:lon tokens (parsed back by routeParse.js), so
// they travel with the route text everywhere it already goes.

// Filed ICAO flight plan, e.g.
//   (FPL-MXD372-IS / -B738/M-SDF / -WMKK1815 / -N0461F350 ... / -WPDL0353 WAAA WATT / -PBN/...)
// Fields are split on "-" at the start of a line (hyphens inside a line are data).
function readFlight(text) {
  const m = /\(FPL-([\s\S]*?)\)/.exec(text)
  if (!m) return null
  const fields = `(FPL-${m[1]}`.split(/\r?\n\s*-/)
  const flight = /^\(FPL-([A-Z0-9]+)-/.exec(fields[0])?.[1] ?? ''
  const dep = /^([A-Z]{4})\d{4}\s*$/.exec(fields[2] ?? '')?.[1]
  const arr = /^([A-Z]{4})\d{4}((?:\s+[A-Z]{4})*)\s*$/.exec(fields[4] ?? '')
  if (!dep || !arr) return null
  const alts = arr[2].trim()
  return { flight, dep, arr: arr[1], destAlts: alts ? alts.split(/\s+/).slice(0, 2) : [] }
}

// "ENROUTE ALT : WMKK WIII WADD WAAA WPDL" minus airports already used elsewhere.
function readEnroute(text, exclude) {
  const m = /ENROUTE ALT[ \t]*:[ \t]*([^\n\r<]*)/.exec(text)
  const seen = new Set(exclude)
  return (m?.[1].match(/\b[A-Z]{4}\b/g) ?? []).filter(c => !seen.has(c) && seen.add(c))
}

const round4 = n => Math.round(n * 1e4) / 1e4

// XmlOFP: <Waypoint waypointName="KADAR" ...><Coordinates latitude="-408.0" longitude="387822.0"/>
// in arc-seconds (south and west negative). Alternate legs come after <AlternateRoutes>.
function xmlPoints(text) {
  const main = text.split('<AlternateRoutes>')[0]
  const re = /<Waypoint\s+waypointName="([^"]+)"[\s\S]*?<Coordinates\s+latitude="(-?[\d.]+)"\s+longitude="(-?[\d.]+)"/g
  return [...main.matchAll(re)].map(m => ({ name: m[1], lat: round4(m[2] / 3600), lon: round4(m[3] / 3600) }))
}

// PFP navlog: each waypoint is two lines —
//   "KK701 N02 47.6 CLB 172/006 ..."  then  "DCT  E101 41.5 MITO1D P006 ..."
function pdfPoints(lines) {
  const out = []
  for (let i = 0; i < lines.length - 1; i++) {
    const a = /^(\S+)\s+([NS])(\d{2})\s(\d{2}\.\d)\b/.exec(lines[i].trim())
    const b = a && /\b([EW])(\d{3})\s(\d{2}\.\d)\b/.exec(lines[i + 1])
    if (!b) continue
    out.push({
      name: a[1],
      lat: round4((a[2] === 'S' ? -1 : 1) * (+a[3] + a[4] / 60)),
      lon: round4((b[1] === 'W' ? -1 : 1) * (+b[2] + b[3] / 60)),
    })
  }
  return out
}

// Main route only: drop the departure airport's own row, the computed TOC/TOD
// points, and everything from the arrival airport on (missed approach and the
// alternate legs follow it).
function trimRoute(points, dep, arr) {
  let pts = points
    .map(p => ({ ...p, name: p.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13) }))
    .filter(p => p.name && p.name !== 'TOC' && p.name !== 'TOD')
  if (pts[0]?.name === dep) pts = pts.slice(1)
  const end = pts.findIndex(p => p.name === arr)
  return end >= 0 ? pts.slice(0, end) : pts
}

function finish(flight, text, rawPoints) {
  if (!flight) return { ok: false, error: "Couldn't find the filed flight plan in this file." }
  const points = trimRoute(rawPoints, flight.dep, flight.arr)
  if (!points.length) return { ok: false, error: "Couldn't find the route points in this file." }
  return {
    ok: true,
    flight: flight.flight, dep: flight.dep, arr: flight.arr,
    destAlts: flight.destAlts,
    enrouteAlts: readEnroute(text, [flight.dep, flight.arr, ...flight.destAlts]),
    points,
  }
}

export const parseOfpXml = text => finish(readFlight(text), text, xmlPoints(text))

/** @param {string[]} lines  the PFP's text, one string per line (pdfText.js) */
export const parseOfpPdf = lines => finish(readFlight(lines.join('\n')), lines.join('\n'), pdfPoints(lines))

/** "WMKK KK701:2.7933:101.6917 ... WPDL" — what routeParse.js reads back as positioned fixes. */
export const ofpRouteText = r =>
  [r.dep, ...r.points.map(p => `${p.name}:${p.lat}:${p.lon}`), r.arr].join(' ')

/** The values a tab's boxes take (enroute capped at the tab's `eraMax` fields). */
export function ofpToFields(r, eraMax = 5) {
  const enroute = r.enrouteAlts.slice(0, eraMax)
  return {
    dep: r.dep,
    arr: r.arr,
    routeText: ofpRouteText(r),
    destAlts: { alt1: r.destAlts[0] ?? '', alt2: r.destAlts[1] ?? '' },
    enrouteCount: enroute.length,
    enrouteAlts: Array.from({ length: eraMax }, (_, i) => enroute[i] ?? ''),
  }
}
