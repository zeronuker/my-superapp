// Builds one winds-aloft picture: downloads the two wind fields (east-west and north-south) for a flight
// level from NOAA's GFS forecast on AWS, decodes them in the browser, and draws speed shading, wind barbs
// and the route over the same relief map the satellite picture uses.
// The maths is in utils/gfsIndex.js, grib2.js and windPicture.js; the shared map drawing is in mapPicture.js.

import { decodeGrib2Message } from '../utils/grib2'
import {
  cycleCandidates, forecastStep, gfsFileUrl, gfsIndexUrl, parseGfsIndex, messageRange, pressureLevelName, WIND_LEVELS,
} from '../utils/gfsIndex'
import { windSpeedKt, windFromDeg, sampleGrid, windBarb, windShade, SHADE_LEGEND_KT } from '../utils/windPicture'
import { lngOfX, latOfY } from '../utils/satSnapshot'
import { framePicture, loadBaseLayers, newCanvas, drawRelief, drawCoast, drawRoute, drawStamp, haloText, MONO } from './mapPicture'

const FETCH_MS = 40000
const SHADE_SCALE = 4              // the colour shading is computed at 1/4 size and stretched, which also smooths it
const BARB_SPACING = 58            // pixels between barbs

const withTimeout = signal => (AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_MS)].filter(Boolean)) : signal)

async function fetchText(url, signal) {
  const r = await fetch(url, { signal: withTimeout(signal) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

async function fetchRange(url, { start, end }, signal) {
  const r = await fetch(url, { signal: withTimeout(signal), headers: { Range: `bytes=${start}-${end}` } })
  if (r.status !== 206 && !(r.status === 200 && start === 0)) throw new Error(`HTTP ${r.status}`)
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes.length !== end - start + 1) throw new Error('short GFS message')
  return bytes
}

// The newest GFS run that has this time's forecast hour published, with its wind at one pressure level.
async function loadWind(hpa, validMs, signal) {
  let lastError = new Error('no GFS run available')
  for (const cycle of cycleCandidates(Date.now())) {
    const step = forecastStep(cycle.runMs, validMs)
    try {
      const messages = parseGfsIndex(await fetchText(gfsIndexUrl(cycle, step), signal))
      const level = pressureLevelName(hpa)
      const uRange = messageRange(messages, 'UGRD', level), vRange = messageRange(messages, 'VGRD', level)
      if (!uRange || !vRange) throw new Error('wind level missing')
      const file = gfsFileUrl(cycle, step)
      const [u, v] = await Promise.all([fetchRange(file, uRange, signal), fetchRange(file, vRange, signal)]).then(b => b.map(decodeGrib2Message))
      if (u.ni !== v.ni || u.nj !== v.nj || u.la1 !== v.la1 || u.lo1 !== v.lo1) throw new Error('wind grids do not match')
      return { u, v, cycle, step, validMs: cycle.runMs + step * 3600000 }
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError
}

const stamp = ms => {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()} ${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

// opts: { markers, path }  the route to draw (empty for a region picture)
//       { coords, pad }    the area, as for the satellite picture
//       { fl }             flight level (one of WIND_LEVELS)
//       { validMs }        the time the wind should be valid for (default now)
// Resolves { image (JPEG data URL), takenAt, fl, hpa, runMs, validMs, credits, width, height }.
export async function buildWindSnapshot(opts = {}, signal) {
  const level = WIND_LEVELS.find(l => l.fl === opts.fl) ?? WIND_LEVELS.find(l => l.fl === 340)
  const { f, route, pins } = framePicture(opts)
  const [wind, [coast, relief]] = await Promise.all([loadWind(level.hpa, opts.validMs ?? Date.now(), signal), loadBaseLayers(f, signal)])
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const { u, v } = wind

  // lng/lat under a picture pixel
  const lngAt = px => lngOfX(f.minX + px / f.width * (f.maxX - f.minX))
  const latAt = py => latOfY(f.maxY - py / f.height * (f.maxY - f.minY))
  const windAt = (px, py) => {
    const lng = lngAt(px), lat = latAt(py)
    return { u: sampleGrid(u, lng, lat), v: sampleGrid(v, lng, lat), lat }
  }

  const { canvas, ctx } = newCanvas(f)
  drawRelief(ctx, f, relief)

  // speed shading, so the jet stream stands out
  const sw = Math.ceil(f.width / SHADE_SCALE), sh = Math.ceil(f.height / SHADE_SCALE)
  const shade = document.createElement('canvas'); shade.width = sw; shade.height = sh
  const sctx = shade.getContext('2d')
  const img = sctx.createImageData(sw, sh)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const w = windAt((x + 0.5) * SHADE_SCALE, (y + 0.5) * SHADE_SCALE)
      const [r, g, b, a] = windShade(windSpeedKt(w.u, w.v))
      const i = (y * sw + x) * 4
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a * 255
    }
  }
  sctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(shade, 0, 0, f.width, f.height)

  drawCoast(ctx, f, coast)

  // wind barbs on an even grid of pixels
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (let py = BARB_SPACING / 2; py < f.height - 28; py += BARB_SPACING) {
    for (let px = BARB_SPACING / 2; px < f.width; px += BARB_SPACING) {
      const w = windAt(px, py)
      const kt = windSpeedKt(w.u, w.v)
      const barb = windBarb(kt, windFromDeg(w.u, w.v), 30, w.lat < 0)
      ctx.save(); ctx.translate(px, py)
      if (barb.calm) {
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(8,12,28,0.9)'; ctx.lineWidth = 3.5; ctx.stroke()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      } else {
        const draw = (paint) => {
          ctx.beginPath(); ctx.moveTo(...barb.staff[0]); ctx.lineTo(...barb.staff[1])
          barb.lines.forEach(([a, b]) => { ctx.moveTo(...a); ctx.lineTo(...b) })
          barb.flags.forEach(([a, b, c]) => { ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath() })
          paint()
        }
        draw(() => { ctx.strokeStyle = 'rgba(8,12,28,0.9)'; ctx.lineWidth = 3.6; ctx.stroke() })
        draw(() => { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fill() })
      }
      ctx.restore()
    }
  }

  drawRoute(ctx, f, route, pins)

  // legend: what the colours mean
  const lx = 10, ly = 10, bw = 36
  ctx.fillStyle = 'rgba(5,8,20,0.7)'; ctx.fillRect(lx, ly, bw * SHADE_LEGEND_KT.length + 16, 46)
  haloText(ctx, `FL${level.fl} · ${level.hpa} hPa · WIND KT`, lx + 8, ly + 14, 11)
  SHADE_LEGEND_KT.forEach((kt, i) => {
    const [r, g, b] = windShade(kt)
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(lx + 8 + i * bw, ly + 22, bw - 2, 8)
    ctx.font = `10px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillText(String(kt), lx + 8 + i * bw, ly + 42)
  })

  drawStamp(ctx, f, `GFS ${String(wind.cycle.hour).padStart(2, '0')}Z RUN · VALID ${stamp(wind.validMs)} · FL${level.fl}`, 'NOAA GFS · MODEL FORECAST')

  return {
    image: canvas.toDataURL('image/jpeg', 0.84), takenAt: Date.now(), fl: level.fl, hpa: level.hpa,
    runMs: wind.cycle.runMs, validMs: wind.validMs, credits: ['NOAA GFS'], width: f.width, height: f.height,
  }
}
