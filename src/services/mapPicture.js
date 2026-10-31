// Pieces shared by the satellite and winds pictures: the briefing's route and airports as map input,
// fetching GIBS layers, and drawing the relief map, coastline, route, airport codes and the stamp bar.
// The maths is in utils/satSnapshot.js.

import { lookupAirport } from '../data/airports'
import { FIX_OVERRIDES } from '../data/fixOverrides'
import { buildRouteLine } from '../utils/routeParse'
import { routeLineCoords } from '../utils/routeLine'
import { frameBBox, unwrapPath, unwrapLng, toPixel, lngOfX, overlayUrl, bandPieces } from '../utils/satSnapshot'
import { ALERT_COLOR } from '../utils/cyclones'

export const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const KIND_COLOR = { dep: '#22d3ee', arr: '#22d3ee', alt: '#ffffff', era: '#a78bfa' }
const FETCH_MS = 60000            // EUMETSAT can take tens of seconds

export const asBitmap = bytes => createImageBitmap(new Blob([bytes], { type: 'image/png' }))

export async function fetchBytes(url, signal) {
  const r = await fetch(url, { signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_MS)].filter(Boolean)) : signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.arrayBuffer()
}

// Departure, arrival, the destination alternates and the enroute alternates of a briefing as
// map markers, plus the route's own [lng, lat] path (through its fixes when the route was pasted,
// otherwise the great circle between dep and arr).
export function snapshotInputFromBriefing(route, data) {
  const markers = []
  const seen = new Set()
  const add = (icao, kind) => {
    const code = typeof icao === 'string' ? icao.trim().toUpperCase() : ''
    if (code.length < 3 || seen.has(code)) return
    seen.add(code)
    const ap = lookupAirport(code)
    if (ap) markers.push({ icao: code, kind, lat: ap.lat, lng: ap.lng })
  }
  add(route?.dep, 'dep'); add(route?.arr, 'arr')
  add(route?.destAlts?.alt1, 'alt'); add(route?.destAlts?.alt2, 'alt')
  for (let i = 0; i < (route?.enrouteCount ?? 0); i++) add(route?.enrouteAlts?.[i], 'era')

  const dep = markers.find(m => m.kind === 'dep'), arr = markers.find(m => m.kind === 'arr')
  let path = []
  if (dep && arr) {
    const line = data?.routeFixes ? buildRouteLine(dep, arr, data.routeFixes, FIX_OVERRIDES) : null
    path = routeLineCoords(line ? line.points : [dep, arr])
  }
  return { markers, path }
}

// The picture's area: route and pins unwrapped across the date line, and the Mercator frame around them.
// opts: { markers, path, coords, pad }
export function framePicture(opts = {}) {
  const { markers = [], path = [], pad = 0.12 } = opts
  const route = unwrapPath(path)
  const refLng = route.length ? route[Math.floor(route.length / 2)][0] : 0
  const pins = markers.map(m => ({ ...m, lng: unwrapLng(m.lng, refLng) }))
  const f = frameBBox(opts.coords ?? [...route, ...pins.map(m => [m.lng, m.lat])], pad)
  return { f, route, pins, west: lngOfX(f.minX), east: lngOfX(f.maxX) }
}

// True when no part of a picture that should be solid is see-through (checked on a small copy, along a few rows).
function isSolid(bitmap) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 6
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, 64, 6)
  const px = ctx.getImageData(0, 0, 64, 6).data
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return false
  return true
}

// The relief map under the picture and the coastline over it (GIBS layers, cut at the date line).
// At some exact picture sizes GIBS leaves a strip at one edge of the relief map empty (the same map at a slightly
// different width is complete), so a gap is answered with the same box at another width. The map is drawn stretched
// to fit anyway.
const RETRY_WIDTHS = [1.3, 0.8, 1.7]
export function loadBaseLayers(f, signal) {
  const whole = bandPieces(f, { sat: { source: 'gibs' }, from: lngOfX(f.minX), to: lngOfX(f.maxX) })
  const overlay = (layer, solid = false) => Promise.all(whole.map(async sub => {
    let bitmap = await asBitmap(await fetchBytes(overlayUrl(layer, sub), signal))
    for (const k of RETRY_WIDTHS) {
      if (!solid || isSolid(bitmap)) break
      bitmap = await asBitmap(await fetchBytes(overlayUrl(layer, { ...sub, width: Math.round(sub.width * k) }), signal))
    }
    return { sub, bitmap }
  }))
  return Promise.allSettled([overlay('Coastlines_15m'), overlay('BlueMarble_ShadedRelief_Bathymetry', true)])
}

export function newCanvas(f) {
  const c = document.createElement('canvas')
  c.width = f.width; c.height = f.height
  return { canvas: c, ctx: c.getContext('2d') }
}

export function haloText(ctx, text, x, y, size, color = '#fff') {
  ctx.font = `bold ${size}px ${MONO}`
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(8,12,28,0.9)'; ctx.strokeText(text, x, y)
  ctx.fillStyle = color; ctx.fillText(text, x, y)
}

// A copy of a transparent picture painted one colour (its shape kept).
function tinted(bitmap, color) {
  const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height
  const x = c.getContext('2d')
  x.drawImage(bitmap, 0, 0)
  x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height)
  return c
}
const HALO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]

// Background, then the relief map dimmed so what is drawn on it stays readable.
export function drawRelief(ctx, f, relief) {
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, f.width, f.height)
  if (relief.status === 'fulfilled') relief.value.forEach(({ sub, bitmap }) => ctx.drawImage(bitmap, sub.drawX, 0, sub.drawW, f.height))
  ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(0, 0, f.width, f.height)
}

// White line with a dark edge so it shows on bright and dark backgrounds.
export function drawCoast(ctx, f, coast) {
  if (coast.status !== 'fulfilled') return
  coast.value.forEach(({ sub, bitmap }) => {
    const dark = tinted(bitmap, 'rgba(5,8,20,0.85)'), white = tinted(bitmap, '#ffffff')
    HALO_DIRS.forEach(([dx, dy]) => ctx.drawImage(dark, sub.drawX + dx * 1.5, dy * 1.5, sub.drawW, f.height))
    ;[[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].forEach(([dx, dy]) => ctx.drawImage(white, sub.drawX + dx, dy, sub.drawW, f.height))
  })
}

// The route line and the airport markers with their codes.
export function drawRoute(ctx, f, route, pins) {
  if (route.length > 1) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    const trace = () => { ctx.beginPath(); route.forEach(([lng, lat], i) => { const p = toPixel(lng, lat, f); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y) }) }
    trace(); ctx.strokeStyle = 'rgba(8,12,28,0.9)'; ctx.lineWidth = 5.5; ctx.stroke()
    trace(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke()
  }
  pins.forEach(m => {
    const p = toPixel(m.lng, m.lat, f), big = m.kind === 'dep' || m.kind === 'arr'
    ctx.beginPath(); ctx.arc(p.x, p.y, big ? 6 : 4.5, 0, Math.PI * 2)
    ctx.fillStyle = KIND_COLOR[m.kind]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(8,12,28,0.95)'; ctx.stroke()
    haloText(ctx, m.icao, p.x + 9, p.y - 8, big ? 14 : 12, KIND_COLOR[m.kind])
  })
}

// The strip along the bottom: what and when on the left, credits on the right.
export function drawStamp(ctx, f, left, right) {
  ctx.fillStyle = 'rgba(5,8,20,0.65)'; ctx.fillRect(0, f.height - 24, f.width, 24)
  ctx.font = `11px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'; ctx.fillText(left, 8, f.height - 12)
  ctx.textAlign = 'right'; ctx.fillText(right, f.width - 8, f.height - 12)
}

// Tropical cyclones: the current wind areas (green 60, orange 90, red 120 km/h), the cone of uncertainty, the track
// (solid so far, dashed ahead with the date of each forecast point) and a spiral marker with the name and wind.
// `storms`: [{ name, alert, position, windKt, summary }] as built by services/stormSnapshot.js.
const RADIUS_FILL = { 60: 'rgba(76,175,80,0.22)', 90: 'rgba(255,167,38,0.26)', 120: 'rgba(239,83,80,0.32)' }
const RADIUS_LINE = { 60: 'rgba(76,175,80,0.9)', 90: 'rgba(255,167,38,0.95)', 120: 'rgba(239,83,80,1)' }

function ringPath(ctx, f, ring) {
  ring.forEach(([lng, lat], i) => { const p = toPixel(lng, lat, f); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y) })
  ctx.closePath()
}

function spiral(ctx, x, y, r) {
  ctx.beginPath()
  for (const phase of [0, Math.PI]) {
    for (let t = 0; t <= 1.001; t += 0.05) {
      const a = phase + t * Math.PI * 2.1, d = 1.5 + t * (r - 2)
      const px = x + Math.cos(a) * d, py = y - Math.sin(a) * d
      t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
  }
}

export function drawStorms(ctx, f, storms) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (const s of storms) {
    const { summary } = s
    if (summary.cone) {                                             // the area the centre may travel through
      ctx.beginPath(); ringPath(ctx, f, summary.cone)
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill()
      ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([])
    }
    for (const r of [...summary.radii].sort((a, b) => a.kmh - b.kmh)) {   // 60 first, so the stronger ones sit on top
      ctx.beginPath(); ringPath(ctx, f, r.ring)
      ctx.fillStyle = RADIUS_FILL[r.kmh] ?? 'rgba(255,255,255,0.15)'; ctx.fill()
      ctx.strokeStyle = RADIUS_LINE[r.kmh] ?? '#fff'; ctx.lineWidth = 1.2; ctx.stroke()
    }
    const trace = (pts) => { ctx.beginPath(); pts.forEach(([lng, lat], i) => { const p = toPixel(lng, lat, f); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y) }) }
    const past = summary.track.slice(0, summary.nowIndex + 1), ahead = summary.track.slice(summary.nowIndex)
    if (past.length > 1) { trace(past); ctx.strokeStyle = 'rgba(8,12,28,0.9)'; ctx.lineWidth = 4.5; ctx.stroke(); trace(past); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke() }
    if (ahead.length > 1) {
      ctx.setLineDash([7, 6])
      trace(ahead); ctx.strokeStyle = 'rgba(8,12,28,0.9)'; ctx.lineWidth = 4.5; ctx.stroke()
      trace(ahead); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      ctx.setLineDash([])
    }
    const c = toPixel(s.position[0], s.position[1], f), color = ALERT_COLOR[s.alert] ?? ALERT_COLOR.Green
    const placed = [c]                                              // forecast dates go where there is room: not on the storm, not on each other
    summary.forecast.forEach(({ index, label }) => {
      const [lng, lat] = summary.track[index], p = toPixel(lng, lat, f)
      if (placed.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 34)) return
      placed.push(p)
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = 'rgba(8,12,28,0.9)'; ctx.lineWidth = 1.5; ctx.stroke()
      haloText(ctx, label, p.x + 6, p.y + 14, 10, 'rgba(255,255,255,0.95)')
    })
    ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(8,12,28,0.95)'; ctx.stroke()
    spiral(ctx, c.x, c.y, 8.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.7; ctx.stroke()
    haloText(ctx, s.windKt ? `${s.name} · ${s.windKt} KT` : s.name, c.x + 16, c.y - 12, 13, '#fff')
  }
}
