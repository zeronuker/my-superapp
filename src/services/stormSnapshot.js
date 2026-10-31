// Builds one storms picture: the relief map and coastline, the route and airports, and the current tropical cyclones
// from GDACS drawn on top (no cloud, no wind). Also works out the list shown under the picture: for each storm its
// wind, position, advisory time and how close it is to the route. The maths is in utils/cyclones.js.

import { latOfY } from '../utils/satSnapshot'
import { kmhToKt, distanceToRoute } from '../utils/cyclones'
import { fetchStorms } from './cycloneData'
import { framePicture, loadBaseLayers, newCanvas, drawRelief, drawCoast, drawRoute, drawStamp, drawStorms, haloText, MONO } from './mapPicture'

const CREDIT = 'GDACS · JTWC'

const stamp = ms => {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

// opts: { markers, path }  the route to draw (empty for a region picture)
//       { coords, pad }    the area, as for the satellite picture
// Resolves { image (JPEG data URL), takenAt, ok, storms: [list entries], credits, width, height }.
// `ok` is false when GDACS could not be reached (the picture is still made, without storms).
export async function buildStormSnapshot(opts = {}, signal) {
  const { f, route, pins, west, east } = framePicture(opts)
  const area = { west, east, south: latOfY(f.minY), north: latOfY(f.maxY) }
  const [[coast, relief], found] = await Promise.all([
    loadBaseLayers(f, signal),
    fetchStorms(area, signal).then(value => ({ ok: true, value }), error => { if (signal?.aborted) throw error; return { ok: false, value: [] } }),
  ])
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

  const storms = found.value.map(s => ({ ...s, windKt: s.windKmh ? Math.round(kmhToKt(s.windKmh)) : null }))

  const { canvas, ctx } = newCanvas(f)
  drawRelief(ctx, f, relief)
  drawCoast(ctx, f, coast)
  drawStorms(ctx, f, storms)
  drawRoute(ctx, f, route, pins)

  // legend
  ctx.fillStyle = 'rgba(5,8,20,0.7)'; ctx.fillRect(10, 10, 232, 58)
  haloText(ctx, 'TROPICAL CYCLONES', 18, 25, 11)
  ;[['rgba(76,175,80,0.9)', '60'], ['rgba(255,167,38,0.95)', '90'], ['rgba(239,83,80,1)', '120']].forEach(([c, kmh], i) => {
    ctx.fillStyle = c; ctx.fillRect(18 + i * 38, 33, 34, 7)
    ctx.font = `10px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillText(kmh, 18 + i * 38, 52)
  })
  ctx.font = `10px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText('KM/H WINDS · ', 132, 52)
  ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(132, 36); ctx.lineTo(160, 36); ctx.stroke(); ctx.setLineDash([])
  ctx.fillText('CONE', 166, 40)

  const left = !found.ok ? 'CYCLONE DATA UNAVAILABLE'
    : storms.length ? `${storms.length} ACTIVE STORM${storms.length > 1 ? 'S' : ''} IN THIS AREA`
    : 'NO ACTIVE TROPICAL CYCLONES IN THIS AREA'
  drawStamp(ctx, f, `${left} · CHECKED ${stamp(Date.now())}`, CREDIT)

  return {
    image: canvas.toDataURL('image/jpeg', 0.84), takenAt: Date.now(), ok: found.ok, credits: [CREDIT], width: f.width, height: f.height,
    storms: storms.map(s => ({
      id: s.id, name: s.name, source: s.source, alert: s.alert, windKt: s.windKt, position: s.position,
      advisory: s.summary.advisory || null, updatedMs: s.updatedMs,
      distance: distanceToRoute(s.position, s.summary, route),
    })),
  }
}
