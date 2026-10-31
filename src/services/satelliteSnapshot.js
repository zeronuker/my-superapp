// Builds one satellite picture: asks each needed satellite (NASA GIBS or EUMETSAT) for a
// finished image of the route's area, joins them, and draws the route on top.
// The maths is in utils/satSnapshot.js; the map drawing shared with the winds picture is in mapPicture.js.

import { FRAME_STEP_MIN, floorToStep, capsUrl, latestFromCapabilities } from '../utils/satFrames'
import {
  bandsForView, wholeView, mapImageUrl, isBlankPicture, bandPieces, probeFrame, mercX,
} from '../utils/satSnapshot'
import {
  asBitmap, fetchBytes, framePicture, loadBaseLayers, newCanvas, drawRelief, drawCoast, drawRoute, drawStamp, haloText,
} from './mapPicture'

const PROBE_TRIES = 12            // 2 hours back, 10 minutes at a time
const CLOUD_OPACITY = 0.55         // so the relief map under the cloud still shows land and sea

// Share of a picture that is not transparent, from a small copy of it.
function opaqueShare(bitmap) {
  const c = document.createElement('canvas'); c.width = 40; c.height = 40
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0, 40, 40)
  const px = ctx.getImageData(0, 0, 40, 40).data
  let n = 0
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++
  return n / (px.length / 4)
}
const MIN_FILLED = 0.5            // a band inside the satellite's view is solid; less means the frame is not all published yet

const pictureShare = pieces => pieces.reduce((n, p) => n + opaqueShare(p.bitmap) * p.sub.drawW, 0) / pieces.reduce((n, p) => n + p.sub.drawW, 0)

// Newest frame this satellite has, and its pictures (one, or two across the date line) for its band of the area.
async function loadSatImage(band, f, signal) {
  const { sat } = band
  const subs = bandPieces(f, band)
  if (!subs.length) throw new Error('band outside the picture')
  const fetchPictures = ms => Promise.all(subs.map(async sub => ({ sub, bitmap: await asBitmap(await fetchBytes(mapImageUrl(sat, ms, sub), signal)) })))

  if (sat.source === 'eumetsat') {
    const r = await fetch(capsUrl(sat), { signal })
    const ms = r.ok ? latestFromCapabilities(await r.text()) : null
    if (ms === null) throw new Error('no frame')
    return { ms, pieces: await fetchPictures(ms) }
  }

  // GIBS publishes a frame in pieces, so the newest one can be there under the satellite but still empty
  // where the route is: a quick look under the satellite, then the band's own picture must be mostly filled.
  const probe = probeFrame(sat)
  const start = floorToStep(Date.now())
  for (let i = 0; i < PROBE_TRIES; i++) {
    const ms = start - i * FRAME_STEP_MIN * 60000
    if (isBlankPicture((await fetchBytes(mapImageUrl(sat, ms, probe), signal)).byteLength)) continue
    const pieces = await fetchPictures(ms)
    if (pictureShare(pieces) >= MIN_FILLED) return { ms, pieces }
  }
  throw new Error('no frame')
}

const hhmm = ms => `${new Date(ms).toISOString().slice(11, 16)}Z`

// opts: { markers, path }  the route to draw (empty for a plain region picture)
//       { coords }          [lng, lat] points that decide the area (default: path + markers)
//       { only }            one satellite fills the whole picture (region stills)
//       { pad }             extra border around the area
// Resolves { image (JPEG data URL), takenAt, sats: [{ id, label, time }], credits, width, height }.
export async function buildSatSnapshot(opts = {}, signal) {
  const { only = null } = opts
  const { f, route, pins, west, east } = framePicture(opts)
  const bands = only ? wholeView(only, west, east) : bandsForView(west, east)

  // EUMETSAT slows down and drops requests when several arrive at once, so those go one after another.
  let eumetsatQueue = Promise.resolve()
  const load = b => {
    if (b.sat.source !== 'eumetsat') return loadSatImage(b, f, signal)
    const run = eumetsatQueue.then(() => loadSatImage(b, f, signal))
    eumetsatQueue = run.catch(() => {})
    return run
  }
  const settle = p => p.then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
  const [[coast, relief], ...sats] = await Promise.all([loadBaseLayers(f, signal), ...bands.map(b => settle(load(b)))])
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  if (sats.every(s => s.status !== 'fulfilled')) throw new Error('no satellite image')

  const { canvas, ctx } = newCanvas(f)
  drawRelief(ctx, f, relief)

  const px = lng => (mercX(lng) - f.minX) / (f.maxX - f.minX) * f.width
  bands.forEach((b, i) => {
    const x0 = Math.max(0, px(b.from)), x1 = Math.min(f.width, px(b.to))
    ctx.save()
    ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, f.height); ctx.clip()
    ctx.globalAlpha = CLOUD_OPACITY
    if (sats[i].status === 'fulfilled') sats[i].value.pieces.forEach(({ sub, bitmap }) => ctx.drawImage(bitmap, sub.drawX, 0, sub.drawW, f.height))
    else { ctx.fillStyle = '#141b36'; ctx.fillRect(x0, 0, x1 - x0, f.height) }
    ctx.restore()
  })
  drawCoast(ctx, f, coast)

  // thin line where one satellite hands over to the next
  ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1
  bands.slice(1).forEach(b => { const x = px(b.from); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, f.height); ctx.stroke() })
  ctx.restore()
  bands.forEach((b, i) => {
    const x0 = Math.max(0, px(b.from))
    haloText(ctx, sats[i].status === 'fulfilled' ? b.sat.short : `${b.sat.short} · NO IMAGE`, x0 + 8, 20, 12, 'rgba(255,255,255,0.9)')
  })

  drawRoute(ctx, f, route, pins)

  const used = sats.map((s, i) => ({ id: bands[i].sat.id, label: bands[i].sat.short, time: s.status === 'fulfilled' ? s.value.ms : null }))
  const credits = [...new Set(bands.filter((_, i) => sats[i].status === 'fulfilled').map(b => b.sat.credit))]
  const stamp = `AS OF ${used.filter(u => u.time).map(u => `${u.label.split(' ').pop()} ${hhmm(u.time)}`).join(' · ')}`
  drawStamp(ctx, f, stamp, credits.join('  ·  '))

  return { image: canvas.toDataURL('image/jpeg', 0.82), takenAt: Date.now(), sats: used, credits, width: f.width, height: f.height }
}
