// Pure readers for the company OFP (no React/DOM — vitest runs in node).
// Two formats carry the same flight: the XmlOFP (ARINC 633 XML) and the PFP
// PDF, whose text pdfText.js turns into lines. Both contain the filed ICAO
// flight plan and the "ENROUTE ALT" remark as plain text, so one reader serves
// both; only the route points differ.
//
// parseOfpXml(text) / parseOfpPdf(lines) -> { ok: true, flight, dep, arr, route,
//   destAlts, enrouteAlts, points: [{name, lat, lon}] } | { ok: false, error }
// (`route` is the route as filed, for showing to the pilot; `points` are what the map draws;
// `info` is what identifies the OFP: tail, type, OFP number, STD/STA/computed time, trip, distance;
// `firs` is [{icao, name}] for the FIRs flown through, in order, each once;
// `details` is what the Flight Details tab shows beyond that — fuel, weights, alternates'
// routing, remarks (read by ofpDetails.js).)
// ofpToFields() shapes that for a tab's boxes; ofpRouteText() writes the points
// into the route text as NAME:lat:lon tokens (parsed back by routeParse.js), so
// they travel with the route text everywhere it already goes.

import { icaoToFir, FIR_BY_PREFIX } from '../data/firLookup.js'
import { xmlDetails, pdfDetails } from './ofpDetails.js'

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
  // Route as filed ("WMKK MITOS1D MITOS M630 … DIL DCT WPDL"): field 15 without its leading speed/level group.
  const tokens = (fields[3] ?? '').trim().split(/\s+/).filter(Boolean)
  if (/^[NKM]\d{3,4}[FASM]\d{3,4}$/.test(tokens[0])) tokens.shift()
  const dof = /DOF\/(\d{2})(\d{2})(\d{2})/.exec(m[1])   // date of flight (UTC), YYMMDD
  // EET/VTBB0039 VYYF0116 … : each FIR boundary with the elapsed time. The list can run onto the
  // next line, so read up to the next "XXX/" item rather than to the end of the line.
  const eet = /EET\/([\s\S]*?)(?=\s[A-Z]{2,4}\/|\n\s*-|$)/.exec(m[1])
  return {
    flight, dep, arr: arr[1],
    destAlts: alts ? alts.split(/\s+/).slice(0, 2) : [],
    route: [dep, ...tokens, arr[1]].join(' '),
    dof: dof ? `20${dof[1]}-${dof[2]}-${dof[3]}` : null,
    stdHm: /^[A-Z]{4}(\d{4})/.exec(fields[2])?.[1] ?? null,
    eet: eet ? [...eet[1].matchAll(/\b([A-Z]{4})(\d{2})(\d{2})\b/g)].map(x => ({ icao: x[1], min: +x[2] * 60 + +x[3] })) : [],
  }
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

// ── Identity details, so the pilot can tell it is the right OFP ───────────────
// info = { tail, type, ofpNo, std, sta, computed (ISO UTC strings), tripMin, distNm } — any may be null.

const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z')
const atUtc = (date, hh, mm) => Date.parse(`${date}T${hh}:${mm}:00Z`)
const DAY_MS = 864e5

// The XmlOFP writes the aircraft type with spaces ("B737 800WS CFM56-7B24"); the PFP prints
// "B737-800WS/CFM56-7B24". First space to "-", second to "/" so both read alike.
const normType = s => (s ? s.trim().replace(' ', '-').replace(' ', '/') : null)

function xmlInfo(text) {
  const attr = re => re.exec(text)?.[1] ?? null
  const trip = /<FlightTime>\s*<EstimatedTime>\s*<Value>PT(\d+)H(\d+)M/.exec(text)
  const dist = /<GroundDistance>\s*(?:<[^>]*>\s*)*([\d.]+)/.exec(text)?.[1]
  return {
    tail: attr(/aircraftRegistration="([^"]+)"/),
    type: normType(attr(/airlineSpecificSubType="([^"]+)"/)),
    ofpNo: attr(/flightPlanId="([^"]+)"/),
    std: attr(/scheduledTimeOfDeparture="([^"]+)"/),
    sta: attr(/<ScheduledTimeOfArrival>([^<]+)</),
    computed: attr(/computedTime="([^"]+)"/),
    tripMin: trip ? +trip[1] * 60 + +trip[2] : null,
    distNm: dist ? Math.round(+dist) : null,
  }
}

// The PFP prints only clock times ("STA 22:30", "COMPUTED AT 14.45Z"); the dates come from the
// filed plan's DOF and STD. STA is the next 22:30 after STD; computed is the last 14:45 before it.
function pdfInfo(text, f) {
  const air = /AIRCRAFT\s*:\s*(\S+)\s+-\s+(\S+)/.exec(text)
  const sta = /\bSTA\s+(\d{2}):(\d{2})/.exec(text)
  const comp = /COMPUTED AT\s+(\d{2})[.:](\d{2})Z/.exec(text)
  const trip = /TRIP TIME:\s*(\d{1,2}):(\d{2})/.exec(text)
  const dist = /TTL DIST\s*:\s*(\d+)/.exec(text)?.[1]
  let std = null, staMs = null, compMs = null
  if (f?.dof && f.stdHm) {
    std = atUtc(f.dof, f.stdHm.slice(0, 2), f.stdHm.slice(2))
    if (sta) { staMs = atUtc(f.dof, sta[1], sta[2]); if (staMs <= std) staMs += DAY_MS }
    if (comp) { compMs = atUtc(f.dof, comp[1], comp[2]); if (compMs > std) compMs -= DAY_MS }
  }
  return {
    tail: air?.[1] ?? null,
    type: air?.[2] ?? null,
    ofpNo: /Log Nr\.?:?\s*(\d+)/.exec(text)?.[1] ?? null,
    std: std != null ? iso(std) : null,
    sta: staMs != null ? iso(staMs) : null,
    computed: compMs != null ? iso(compMs) : null,
    tripMin: trip ? +trip[1] * 60 + +trip[2] : null,
    distNm: dist ? +dist : null,
  }
}

// ── FIRs along the route, in order, each once ─────────────────────────────────
// XmlOFP: the FIR at every waypoint (airspaceICAOCode + AirspaceName), which includes the one
// the flight starts in. PFP/PFB: the filed plan's EET list has every FIR entered after take-off
// (a re-entered FIR is listed twice), so the departure FIR comes from the departure airport.
const titleCase = s => s.toLowerCase().replace(/\b[a-z]+/g, w => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))

function xmlFirs(text) {
  const main = text.split('<AlternateRoutes>')[0]
  return [...main.matchAll(/<Airspace airspaceICAOCode="([A-Z]{4})">\s*<AirspaceName>([^<]*)</g)]
    .map(m => ({ icao: m[1], name: `${titleCase(m[2].trim())} FIR` }))
}

function listFirs(fromXml, flight) {
  let list = fromXml
  if (!list.length) {
    const dep = icaoToFir(flight.dep)
    list = [...(dep ? [dep] : []), ...flight.eet.map(({ icao: code }) => {
      const known = Object.values(FIR_BY_PREFIX).find(f => f.fir === code)
      return { icao: code, name: known ? known.name : code }
    })]
  }
  const seen = new Set()
  return list.filter(f => !seen.has(f.icao) && seen.add(f.icao))
}

// Minutes into the flight when each FIR is first entered, from the filed plan's EET list.
// The first FIR is the one the flight starts in, which the list does not print: 0.
function firsWithTimes(firs, eet) {
  return firs.map((f, i) => ({ ...f, min: eet.find(e => e.icao === f.icao)?.min ?? (i === 0 ? 0 : null) }))
}

function finish(flight, text, rawPoints, info, xmlAirspaces = [], readDetails = null) {
  if (!flight) return { ok: false, error: "Couldn't find the filed flight plan in this file." }
  const points = trimRoute(rawPoints, flight.dep, flight.arr)
  if (!points.length) return { ok: false, error: "Couldn't find the route points in this file." }
  const enrouteAlts = readEnroute(text, [flight.dep, flight.arr, ...flight.destAlts])
  const firs = listFirs(xmlAirspaces, flight)
  return {
    ok: true,
    flight: flight.flight, dep: flight.dep, arr: flight.arr,
    route: flight.route,
    destAlts: flight.destAlts,
    enrouteAlts,
    points,
    info,
    firs,
    // What the Flight Details tab shows beyond `info`; `dep`/`arr` say which flight it describes.
    details: { dep: flight.dep, arr: flight.arr, route: flight.route, enrouteAlts, firs: firsWithTimes(firs, flight.eet), ...readDetails(text) },
  }
}

export const parseOfpXml = text => finish(readFlight(text), text, xmlPoints(text), xmlInfo(text), xmlFirs(text), xmlDetails)

/** @param {string[]} lines  the PFP's text, one string per line (pdfText.js) */
export function parseOfpPdf(lines) {
  const text = lines.join('\n')
  const flight = readFlight(text)
  return finish(flight, text, pdfPoints(lines), pdfInfo(text, flight), [], pdfDetails)
}

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
    filedRoute: r.route,
    flight: r.flight,
    info: r.info,
    details: r.details,
    firs: r.firs,
    destAlts: { alt1: r.destAlts[0] ?? '', alt2: r.destAlts[1] ?? '' },
    enrouteCount: enroute.length,
    enrouteAlts: Array.from({ length: eraMax }, (_, i) => enroute[i] ?? ''),
  }
}
