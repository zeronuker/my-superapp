// Tropical cyclones from GDACS (the UN/EC Global Disaster Alert and Coordination System), whose storm data
// comes from JTWC. Pure helpers: reading the storm list, boiling one storm's geometry file down to what the
// picture draws (track, cone, current wind areas, forecast time labels), and working out where a storm is
// relative to the picture's area and the route. Fetching is in services/cycloneData.js, drawing in mapPicture.js.

import { greatCircleNm } from '../modules/prayer/services/flightCalc'
import { unwrapLng } from './satSnapshot'

export const ALERT_COLOR = { Green: '#4CAF50', Orange: '#FFA726', Red: '#EF5350' }
export const kmhToKt = kmh => kmh / 1.852

const utcMs = s => {
  if (!s) return NaN
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
}

// "01/11 06:00 UTC" → "01/11 06Z"
export const shortTime = label => String(label ?? '').replace(/:\d\d( UTC)?$/, 'Z')

const round1 = n => Math.round(n * 10) / 10

// Keep at most `keep` points of a ring (the cone and wind areas arrive with 300 to 500 points each).
function thin(ring, keep) {
  const pts = ring.map(([x, y]) => [round1(x), round1(y)])
  if (pts.length <= keep) return pts
  const step = pts.length / keep
  return Array.from({ length: keep }, (_, i) => pts[Math.floor(i * step)])
}

// Current storms from GDACS's event list (`EVENTS4APP?eventlist=TC`): one entry per storm.
export function parseStormList(json) {
  const out = []
  for (const f of json?.features ?? []) {
    const p = f.properties ?? {}
    if (p.eventtype !== 'TC' || String(p.iscurrent) !== 'true') continue
    const coords = f.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const url = typeof p.url === 'string' ? (/geometry'?"?\s*:\s*'?"?([^'"\s,}]+)/.exec(p.url)?.[1] ?? null) : p.url?.geometry ?? null
    const sev = typeof p.severitydata === 'object' ? p.severitydata : null
    out.push({
      id: String(p.eventid), name: p.eventname || p.name || 'Unnamed storm', position: [round1(coords[0]), round1(coords[1])],
      alert: p.alertlevel || p.episodealertlevel || 'Green', source: p.source || 'JTWC',
      windKmh: Number.isFinite(sev?.severity) ? sev.severity : null, country: p.country || '',
      updatedMs: utcMs(p.datemodified), geometryUrl: url,
    })
  }
  return out
}

// Joins the track's two-point segments end to start into one line, oldest point first.
function chainTrack(segments) {
  const next = new Map(segments.map(([a, b]) => [`${a}`, b]))
  const ends = new Set(segments.map(([, b]) => `${b}`))
  const heads = segments.map(([a]) => a).filter(a => !ends.has(`${a}`))
  let best = []
  for (const h of heads) {
    const line = [h]
    for (let cur = next.get(`${h}`); cur && line.length <= segments.length + 1; cur = next.get(`${cur}`)) line.push(cur)
    if (line.length > best.length) best = line
  }
  return best.map(([x, y]) => [round1(x), round1(y)])
}

const near2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
const nearestIndex = (line, p) => line.reduce((best, q, i) => (near2(q, p) < near2(line[best], p) ? i : best), 0)
const centroid = ring => [ring.reduce((n, [x]) => n + x, 0) / ring.length, ring.reduce((n, [, y]) => n + y, 0) / ring.length]

/**
 * One storm's GDACS geometry file boiled down to what the picture draws.
 * @param {object} geo       the geometry GeoJSON
 * @param {number[]} position  the storm's current [lng, lat] from the list (the track point nearest to it is "now")
 * @returns {{ track: number[][], nowIndex: number, forecast: {index:number,label:string}[], cone: number[][]|null,
 *             radii: {kmh:number, ring:number[][]}[], advisory: string }}
 */
export function summarizeStormGeometry(geo, position) {
  const feats = geo?.features ?? []
  const segments = feats.filter(f => f.geometry?.type === 'LineString' && f.geometry.coordinates.length === 2).map(f => f.geometry.coordinates)
  const track = chainTrack(segments)
  const nowIndex = track.length ? nearestIndex(track, position) : 0

  // each track point has its own wind area, named by the time it is valid for: that names the forecast points
  const forecast = []
  if (track.length) {
    for (const f of feats) {
      const c = f.properties?.Class ?? ''
      if (f.geometry?.type !== 'Polygon' || !c.startsWith('Point_Polygon') || !/UTC$/.test(f.properties?.polygonlabel ?? '')) continue
      const index = nearestIndex(track, centroid(f.geometry.coordinates[0]))
      if (index > nowIndex && !forecast.some(x => x.index === index)) forecast.push({ index, label: shortTime(f.properties.polygonlabel) })
    }
    forecast.sort((a, b) => a.index - b.index)
  }

  const cone = feats.find(f => f.properties?.Class === 'Poly_Cones' && f.geometry?.type === 'Polygon')?.geometry.coordinates[0]
  const radii = feats
    .filter(f => f.geometry?.type === 'Polygon' && /^\d+ km\/h$/.test(f.properties?.polygonlabel ?? '') && (f.properties?.Class ?? '').startsWith('Poly_'))
    .map(f => ({ kmh: parseInt(f.properties.polygonlabel, 10), ring: thin(f.geometry.coordinates[0], 80) }))
    .sort((a, b) => a.kmh - b.kmh)
  const advisory = feats.find(f => f.properties?.polygondate)?.properties.polygondate ?? ''
  return { track, nowIndex, forecast, cone: cone ? thin(cone, 120) : null, radii, advisory }
}

/**
 * The storms from the list whose centre is in or within `margin` degrees of a region's box ([west, south, east, north]).
 * Only the centre is used, not the track or cone, so this is a hint for the region buttons, not the exact answer.
 */
export function stormsInRegion(storms, region, margin = 5) {
  const [west, south, east, north] = region.box
  const mid = (west + east) / 2
  return storms.filter(s => {
    const x = unwrapLng(s.position[0], mid)
    return x >= west - margin && x <= east + margin && s.position[1] >= south - margin && s.position[1] <= north + margin
  })
}

// Every point of a storm that matters for "is it in this picture": track, cone, wind areas.
function stormPoints(position, s) {
  return [position, ...s.track, ...(s.cone ?? []), ...s.radii.flatMap(r => r.ring)]
}

/**
 * Does any part of the storm (position, track, cone, wind areas) fall inside `area`, a { west, east, south, north }
 * box in degrees (east may pass 180), allowing `margin` degrees around it?
 */
export function stormReachesArea(position, s, area, margin = 3) {
  const mid = (area.west + area.east) / 2
  return stormPoints(position, s).some(([lng, lat]) => {
    const x = unwrapLng(lng, mid)
    return x >= area.west - margin && x <= area.east + margin && lat >= area.south - margin && lat <= area.north + margin
  })
}

// Smallest distance in nautical miles between two sets of [lng, lat] points.
function minNm(as, bs) {
  let best = Infinity
  for (const [lo1, la1] of as) for (const [lo2, la2] of bs) {
    const d = greatCircleNm(la1, lo1, la2, lo2)
    if (d < best) best = d
  }
  return best
}

/**
 * How close the storm comes to the route (a list of [lng, lat], about 100 NM apart): `nowNm` is the storm's centre
 * today, `forecastNm` the closest the forecast track or the cone's edge gets. null without a route.
 */
export function distanceToRoute(position, s, route) {
  if (!route?.length) return null
  const nowNm = Math.round(minNm(route, [position]))
  const later = [...s.track.slice(s.nowIndex), ...(s.cone ?? [])]
  const forecastNm = later.length ? Math.round(Math.min(nowNm, minNm(route, later))) : nowNm
  return { nowNm, forecastNm }
}
