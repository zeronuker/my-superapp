// Pure maths for the satellite snapshot (no network, no canvas): the picture's area, which
// satellites are needed to cover it, where one hands over to the next, and the request
// addresses. The fetching and drawing live in services/satelliteSnapshot.js.
//
// One picture per route: each satellite is asked for the same area, returns transparent
// pixels outside its view, and is drawn only in the band of longitudes it is nearest to.

import { SAT_REGIONS, frameIso } from './satFrames'

const R = 6378137                       // Web Mercator radius (m)
const RAD = Math.PI / 180
export const mercX = lng => R * lng * RAD
export const mercY = lat => R * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))
export const lngOfX = x => x / (R * RAD)
export const latOfY = y => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / RAD

export const PICTURE_W = 1200
const MIN_H = 560
const MAX_H = 1000
const MIN_SPAN_M = 1500000              // never closer than ~1500 km, so a short hop still shows weather around it
const MAX_LAT = 80                      // Mercator blows up at the poles

// Returns lng shifted by whole turns so it sits within 180° of refLng (keeps a route that
// crosses the date line in one piece).
export function unwrapLng(lng, refLng) {
  return lng + 360 * Math.round((refLng - lng) / 360)
}

// Follows a path point by point so a date-line crossing becomes 179 → 181, not 179 → -179.
export function unwrapPath(coords) {
  const out = []
  for (const [lng, lat] of coords) {
    out.push([out.length ? unwrapLng(lng, out.at(-1)[0]) : lng, lat])
  }
  return out
}

// The picture's Mercator box and pixel size for a set of [lng, lat] points (already unwrapped).
// `pad` is the fraction added on every side. Width is fixed, height follows the shape.
export function frameBBox(coords, pad = 0.12) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [lng, lat] of coords) {
    const x = mercX(lng), y = mercY(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)))
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const grow = (lo, hi, min) => {
    const span = Math.max(hi - lo, min), mid = (lo + hi) / 2, half = span * (1 + 2 * pad) / 2
    return [mid - half, mid + half]
  }
  ;[minX, maxX] = grow(minX, maxX, MIN_SPAN_M)
  ;[minY, maxY] = grow(minY, maxY, MIN_SPAN_M)
  const width = PICTURE_W
  const height = Math.round(Math.max(MIN_H, Math.min(MAX_H, width * (maxY - minY) / (maxX - minX))))
  // fit the box to that pixel shape, widening the side that is short
  const want = width / height
  const have = (maxX - minX) / (maxY - minY)
  if (have < want) { const w = (maxY - minY) * want, m = (minX + maxX) / 2; minX = m - w / 2; maxX = m + w / 2 }
  else { const h = (maxX - minX) / want, m = (minY + maxY) / 2; minY = m - h / 2; maxY = m + h / 2 }
  return { minX, minY, maxX, maxY, width, height }
}

// [lng, lat] → pixel in the picture.
export function toPixel(lng, lat, f) {
  const refLng = ((f.minX + f.maxX) / 2) / (R * RAD)
  const x = mercX(unwrapLng(lng, refLng))
  const y = mercY(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)))
  return { x: (x - f.minX) / (f.maxX - f.minX) * f.width, y: (f.maxY - y) / (f.maxY - f.minY) * f.height }
}

// The longitude each satellite is nearest to: from the halfway point to its western
// neighbour to the halfway point to its eastern one (going round the globe).
export function satBands() {
  const sats = [...SAT_REGIONS].sort((a, b) => a.lon - b.lon)
  return sats.map((s, i) => {
    const prev = sats[(i + sats.length - 1) % sats.length], next = sats[(i + 1) % sats.length]
    const prevLon = i === 0 ? prev.lon - 360 : prev.lon
    const nextLon = i === sats.length - 1 ? next.lon + 360 : next.lon
    return { sat: s, from: (prevLon + s.lon) / 2, to: (s.lon + nextLon) / 2 }
  })
}

// Satellites needed for a picture spanning west..east degrees (east may pass 180), each with
// the band of that picture (in degrees) it should fill, west to east.
export function bandsForView(westLng, eastLng) {
  const out = []
  for (const b of satBands()) {
    for (const k of [-360, 0, 360]) {
      const from = Math.max(b.from + k, westLng), to = Math.min(b.to + k, eastLng)
      if (to > from) out.push({ sat: b.sat, from, to })
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

// Same area for one chosen satellite (a region still) — it fills the whole picture.
export function wholeView(sat, westLng, eastLng) {
  return [{ sat, from: westLng, to: eastLng }]
}

const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi'
const EUM_WMS = 'https://view.eumetsat.int/geoserver/wms'

const bboxText = f => `${f.minX},${f.minY},${f.maxX},${f.maxY}`

// EUMETSAT answers big pictures slowly (seconds to tens of seconds, more pixels is slower), and
// Meteosat is coarser anyway (3 km), so it is asked for at most this many pixels and stretched when drawn.
const EUMETSAT_MAX_PX = 200000

const WORLD = Math.PI * R               // half the width of the Web Mercator world (m)

// The slice of the picture one satellite is asked for: just its band, not the whole area, cut in two
// where it crosses the date line (the map service has a gap there when asked for one wide picture).
// Each piece lies inside -WORLD..WORLD with `minX/maxX` as the server needs them, and `drawX/drawW`
// say where it sits in the full picture (pixels).
export function bandPieces(f, band) {
  const x0 = Math.max(f.minX, mercX(band.from)), x1 = Math.min(f.maxX, mercX(band.to))
  if (x1 <= x0) return []
  const k = band.sat.source === 'eumetsat' ? Math.min(1, Math.sqrt(EUMETSAT_MAX_PX / ((x1 - x0) / (f.maxX - f.minX) * f.width * f.height))) : 1
  const pieces = []
  for (let start = x0; start < x1;) {
    const turn = Math.floor((start + WORLD) / (2 * WORLD))          // 0 inside -180..180, 1 past the date line, -1 before it
    const end = Math.min(x1, (2 * turn + 1) * WORLD)
    const drawX = (start - f.minX) / (f.maxX - f.minX) * f.width
    const drawW = (end - start) / (f.maxX - f.minX) * f.width
    pieces.push({
      minX: start - 2 * WORLD * turn, maxX: end - 2 * WORLD * turn, minY: f.minY, maxY: f.maxY,
      width: Math.max(8, Math.round(drawW * k)), height: Math.max(8, Math.round(f.height * k)), drawX, drawW,
    })
    start = end
  }
  return pieces
}

// A tiny picture right under the satellite: has this frame been published yet? (Away from the
// satellite the answer would depend on the route, so the check always looks at the same place.)
export function probeFrame(sat) {
  const d = 4
  return { minX: mercX(sat.lon - d), maxX: mercX(sat.lon + d), minY: mercY(-d), maxY: mercY(d), width: 32, height: 32 }
}

// One finished picture of an area from one satellite, PNG with transparent areas.
export function mapImageUrl(sat, ms, f) {
  if (sat.source === 'eumetsat') {
    return `${EUM_WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${sat.layer}&styles=&crs=EPSG:3857`
      + `&bbox=${bboxText(f)}&width=${f.width}&height=${f.height}&format=image/png&transparent=true&time=${new Date(ms).toISOString()}`
  }
  return `${GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${sat.layer}&STYLES=&CRS=EPSG:3857`
    + `&BBOX=${bboxText(f)}&WIDTH=${f.width}&HEIGHT=${f.height}&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${frameIso(ms)}`
}

// A GIBS overlay or base layer (Coastlines_15m, BlueMarble_ShadedRelief_Bathymetry, ...) for the same box.
export function overlayUrl(layer, f) {
  return `${GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&STYLES=&CRS=EPSG:3857`
    + `&BBOX=${bboxText(f)}&WIDTH=${f.width}&HEIGHT=${f.height}&FORMAT=image/png&TRANSPARENT=TRUE`
}

// GIBS answers a time it does not have with a tiny fully transparent PNG, status 200: 83 bytes at the
// probe's 32 px, against about 1.9 KB for a real frame.
export const BLANK_BYTES = 500
export const isBlankPicture = byteLength => byteLength < BLANK_BYTES
