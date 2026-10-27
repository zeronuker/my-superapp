// Draws a briefing PDF (A4, portrait or landscape, dark or light) from utils/briefingPdf.js's model.
// Laid out like the briefing overlay: cards, the app's colours, JetBrains Mono + Inter. jsPDF and the
// fonts are loaded only when someone exports. Pure drawing code: no store, no React.
//
// Layout: every piece is a "block" of known height; blocks flow down the page, a tinted section frame
// is drawn behind the consecutive blocks of one section, and a block that does not fit starts a new page.

import { lookupAirport } from '../data/airports'
import { NOTAM_CATEGORIES } from './notamAPI'
import { tokenizeRaw, parseTafSegments, ROLE_COLORS, CAT_COLORS } from '../utils/metarSeverity'
import { fuelParts, pctOfLimit, weightLevel, fmtWc } from '../utils/flightDetailsCalc'
import { utcParts, localParts, blockMinutes, fmtHm } from '../utils/ofpTimes'
import { pdfFileName } from '../utils/briefingPdf'

const FONT_URLS = { mono: 'fonts/pdf/jetbrains-mono.ttf', sans: 'fonts/pdf/inter.ttf' }

const THEMES = {
  dark: { page: '#0a1020', card: '#141a2e', box: '#1b2340', ink: '#e8ecf5', ink2: '#b8c0d4', dim: '#7c87a3', acc: '#3FE0C5', green: '#4ade80', yellow: '#fcd34d', red: '#f87171', orange: '#fdba74', purple: '#5B6BFF', fir: '#fbbf24', edge: '#ffffff', darken: 0 },
  light: { page: '#f4f6fb', card: '#ffffff', box: '#ebeef7', ink: '#0a1020', ink2: '#3a4258', dim: '#6b7488', acc: '#0c7f6c', green: '#14522a', yellow: '#6b3d00', red: '#8b1212', orange: '#7c2a00', purple: '#4554DA', fir: '#906800', edge: '#0a1020', darken: 0.38 },
}
const FUEL_COLORS = { trip: '#2dd4bf', contingency: '#3b82f6', alternate: '#facc15', finalReserve: '#ec4899', tankering: '#fb923c', extra: '#a78bfa', taxi: '#cbd5e1' }
// The section colours BriefingView uses.
const SEC = { depArr: '#2563EB', destAlt: '#9333EA', era: '#0D9488', notam: '#D97706', sigmet: '#DB2777' }
const NOTAM_CHUNK_LINES = 40 // one NOTAM longer than this continues on the next page

const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)) }
// The embedded fonts cover Latin-1 plus general punctuation; anything else would draw as a broken glyph.
const clean = s => String(s ?? '').replace(/[^\u0000-ÿ -⁯™€−]/g, '?')
const kg = n => (n == null ? '—' : n.toLocaleString('en-US'))

const toBase64 = buf => {
  const bytes = new Uint8Array(buf); let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** { mono, sans } as base64 TTF — fetched from the app (precached by the service worker, so it works offline). */
export async function loadPdfFonts() {
  const base = import.meta.env.BASE_URL || '/'
  const out = {}
  for (const [k, url] of Object.entries(FONT_URLS)) {
    const res = await fetch(base + url)
    if (!res.ok) throw new Error(`font ${url}: ${res.status}`)
    out[k] = toBase64(await res.arrayBuffer())
  }
  return out
}

/** Returns the PDF as an ArrayBuffer. `fonts` = loadPdfFonts()'s result. */
export async function renderBriefingPdf(model, { orientation = 'portrait', theme = 'dark' } = {}, fonts) {
  const { jsPDF } = await import('jspdf')
  const P = THEMES[theme] ?? THEMES.dark
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  for (const [key, family] of [['mono', 'JBM'], ['sans', 'Inter']]) {
    doc.addFileToVFS(`${key}.ttf`, fonts[key])
    // The shipped fonts are variable, so one file serves both weights.
    doc.addFont(`${key}.ttf`, family, 'normal'); doc.addFont(`${key}.ttf`, family, 'bold')
  }
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const M = 11, CW = W - 2 * M, TOP = 11, BOT = H - 11
  const landscape = orientation === 'landscape'
  // Colours that are fixed hexes in the app: darkened on the white theme so they stay readable.
  const fx = c => (P.darken ? mix(c, '#000000', P.darken) : c)
  const line2 = mix(P.card, P.edge, 0.12), line1 = mix(P.card, P.edge, 0.07)
  const fill = c => doc.setFillColor(...rgb(c)), stroke = c => doc.setDrawColor(...rgb(c)), tcol = c => doc.setTextColor(...rgb(c))

  // ── text ─────────────────────────────────────────────────────────────────
  const setF = (font, size, bold) => { doc.setFont(font === 'sans' ? 'Inter' : 'JBM', bold ? 'bold' : 'normal'); doc.setFontSize(size) }
  const tw = (s, { font = 'mono', size = 7, bold = false, cs = 0 } = {}) => { s = clean(s); setF(font, size, bold); return doc.getTextWidth(s) + cs * s.length }
  const fit = (s, maxW, o) => { s = clean(s); if (tw(s, o) <= maxW) return s; while (s.length > 1 && tw(s + '…', o) > maxW) s = s.slice(0, -1); return s + '…' }
  const T = (s, x, y, o = {}) => {
    const { font = 'mono', size = 7, bold = false, color = P.ink, cs = 0, align = 'left', maxW } = o
    const str = maxW ? fit(s, maxW, { font, size, bold, cs }) : clean(s)
    const w = tw(str, { font, size, bold, cs }); setF(font, size, bold); tcol(color)
    doc.text(str, align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y, cs ? { charSpace: cs } : undefined)
    return w
  }
  const wrap = (s, maxW, { font = 'mono', size = 7 } = {}) => { setF(font, size); return String(s ?? '').split('\n').flatMap(l => doc.splitTextToSize(clean(l) || ' ', maxW)) }
  const TL = (lines, x, y, lh, o) => lines.forEach((l, i) => T(l, x, y + i * lh, o)) // lines already wrapped
  const label = (s, x, y, o = {}) => T(String(s).toUpperCase(), x, y, { size: 5.2, color: P.dim, cs: 0.32, ...o })

  // ── shapes ───────────────────────────────────────────────────────────────
  const rr = (x, y, w, h, r, f, s, lw = 0.25) => {
    if (f) fill(f); if (s) { stroke(s); doc.setLineWidth(lw) }
    doc.roundedRect(x, y, w, h, r, r, f && s ? 'FD' : f ? 'F' : 'S')
  }
  const dashed = (x1, y1, x2, y2, c, lw = 0.2) => { stroke(c); doc.setLineWidth(lw); doc.setLineDashPattern([0.7, 0.7], 0); doc.line(x1, y1, x2, y2); doc.setLineDashPattern([], 0) }
  const hline = (x1, y, x2, c, lw = 0.2) => { stroke(c); doc.setLineWidth(lw); doc.line(x1, y, x2, y) }
  // Airliner seen from above, nose to the right. Upper half listed nose to tail, lower half mirrored.
  const PLANE_UP = [[5.4, 0], [4.7, -0.6], [2.4, -0.75], [-0.9, -5.1], [-2.0, -5.1], [-1.5, -0.8], [-3.4, -0.8], [-4.6, -2.5], [-5.4, -2.5], [-5.2, -0.5], [-5.5, 0]]
  const planeIcon = (cx, cy, k, color) => {
    const pts = [...PLANE_UP, ...PLANE_UP.slice(1, -1).reverse().map(([x, y]) => [x, -y])].map(([x, y]) => [cx + x * k, cy + y * k])
    fill(color)
    doc.lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true)
    ;[-1, 1].forEach(sy => rr(cx - 0.5 * k, cy + sy * 2.6 * k - 0.45 * k, 2.4 * k, 0.9 * k, 0.4 * k, color))
  }
  const chip = (x, y, code, color, hollow) => {
    const w = tw(code, { size: 6.4 }) + 3.4
    rr(x, y - 3.5, w, 4.6, 0.8, hollow ? null : mix(P.card, color, 0.10), mix(P.card, color, 0.5), 0.22)
    T(code, x + 1.7, y, { size: 6.4, color })
    return w
  }
  const badge = (x, y, text, color) => { // right-aligned at x
    const w = tw(text, { size: 5.8, bold: true, cs: 0.15 }) + 3.4
    rr(x - w, y - 3.4, w, 4.5, 0.9, mix(P.card, color, 0.14), null)
    T(text, x - w / 2, y, { size: 5.8, bold: true, color, cs: 0.15, align: 'center' }); return w
  }

  // Coloured tokens flowed into lines no wider than maxW.
  const flow = (tokens, maxW, size) => {
    const sp = tw(' ', { size }), lines = [[]]; let x = 0
    for (const t of tokens) {
      if (/^\s+$/.test(t.text)) { if (lines.at(-1).length) x += sp; continue }
      const w = tw(t.text, { size })
      if (x > 0 && x + w > maxW) { lines.push([]); x = 0 }
      lines.at(-1).push({ ...t, x, w }); x += w
    }
    return lines
  }
  const fixColor = c => (/^#/.test(c) ? fx(c) : P.ink)
  const tokLines = (lines, x, y, size, lh, dim) =>
    lines.forEach((ln, i) => ln.forEach(t => T(t.text, x + t.x, y + i * lh, { size, color: dim ? mix(P.box, fixColor(t.color), 0.62) : fixColor(t.color) })))

  // ── cards ────────────────────────────────────────────────────────────────
  const cardUnit = (w, h, drawBody) => ({ h, draw: (x, y, H2 = h) => { rr(x, y, w, H2, 1.4, P.card, line2); drawBody(x, y, H2) } })
  const roleHeader = (x, y, w, icao, role, name, color, rightFn) => {
    hline(x, y + 8, x + w, line1)
    fill(color); doc.rect(x, y, 0.8, 8, 'F')
    let cx = x + 3.2
    cx += T(icao, cx, y + 5.4, { size: 9.5, bold: true }) + 2
    if (role) cx += T(role, cx, y + 5.3, { size: 4.6, color, cs: 0.28 }) + 2
    const right = rightFn ? rightFn() : 0
    if (name) T(name, cx, y + 5.3, { font: 'sans', size: 6.4, color: P.dim, maxW: x + w - 3 - right - cx })
  }
  const sectionTitle = (x, y, text) => T(text.toUpperCase(), x, y, { size: 5.8, color: P.acc, cs: 0.42 })
  const field = (x, y, lab, val, sub, o = {}) => {
    label(lab, x, y); T(val ?? '—', x, y + 4.3, { size: o.size ?? 8.6, color: o.color ?? P.ink, cs: 0.1, maxW: o.maxW })
    if (sub) T(sub, x, y + 7.4, { size: 5.8, color: P.dim, maxW: o.maxW })
  }

  const weatherCard = (w, a) => {
    const role = fx(ROLE_COLORS[a.role] ?? '#94a3b8'), catColor = a.cat ? CAT_COLORS[a.cat] : ROLE_COLORS[a.role] ?? '#94a3b8'
    const bw = w - 6.4, size = 6.6, lh = 3.0
    const mLines = flow(tokenizeRaw(a.metar, catColor, null), bw - 4.4, size)
    const segs = (a.taf ? parseTafSegments(a.taf) : []).map(s => ({ s, lines: flow(s.tokens, bw - 4.4, size) }))
    const noTaf = segs.length === 0
    const mH = mLines.length * lh + 3.2, tH = (noTaf ? 1 : segs.reduce((n, g) => n + g.lines.length * lh, 0) + (segs.length - 1) * 0.7) + 3.2
    return cardUnit(w, 8 + 3 + 4 + mH + 2.6 + 4 + tH + 3.2, (x, y) => {
      roleHeader(x, y, w, a.icao, a.role, a.name, role, () => (a.cat ? badge(x + w - 3, y + 5.4, a.cat, fx(CAT_COLORS[a.cat])) : 0))
      let yy = y + 8 + 3
      label('METAR', x + 3.2, yy + 2.6); yy += 4
      rr(x + 3.2, yy, bw, mH, 0.8, P.box)
      if (a.metar) tokLines(mLines, x + 5.4, yy + 3.0, size, lh); else T('No METAR data', x + 5.4, yy + 3.0, { font: 'sans', size: 6.4, color: P.dim })
      yy += mH + 2.6
      label('TAF', x + 3.2, yy + 2.6); yy += 4
      rr(x + 3.2, yy, bw, tH, 0.8, P.box)
      if (noTaf) { T('No TAF data', x + 5.4, yy + 3.0, { font: 'sans', size: 6.4, color: P.dim }); return }
      let ty = yy + 3.0
      for (const g of segs) { tokLines(g.lines, x + 5.4, ty, size, lh, g.s.isTemporal); ty += g.lines.length * lh + 0.7 }
    })
  }

  // One NOTAM per block (a very long one in chunks), under a header band for its location.
  const notamHeader = (w, l) => {
    const color = l.role ? fx(ROLE_COLORS[l.role] ?? '#94a3b8') : P.acc, empty = l.notams.length === 0
    const h = empty ? 12 : 8
    return { h, draw: (x, y) => {
      rr(x, y, w, h, 1.4, P.card, line2)
      roleHeader(x, y, w, l.icao, l.role, l.name, color, () => tw(`${l.notams.length} ACTIVE`, { size: 5.2, cs: 0.32 }) + 3)
      label(`${l.notams.length} ACTIVE`, x + w - 3, y + 5.2, { align: 'right' })
      if (empty) T('No active NOTAMs', x + 3.2, y + 10.2, { font: 'sans', size: 6.4, color: P.dim })
    } }
  }
  const notamEntries = (w, n) => {
    const cat = NOTAM_CATEGORIES[n.category], color = fx(cat?.color ?? '#6b7280'), size = 6.2, lh = 2.75
    const lines = wrap(n.raw, w - 9, { size }), chunks = []
    for (let i = 0; i < lines.length; i += NOTAM_CHUNK_LINES) chunks.push(lines.slice(i, i + NOTAM_CHUNK_LINES))
    return chunks.map((ls, ci) => {
      const h = 3 + 4.2 + ls.length * lh + 2.4
      return { h, draw: (x, y) => {
        rr(x, y, w, h, 1.2, P.card, line2); fill(color); doc.rect(x, y + 0.3, 0.8, h - 0.6, 'F')
        const w1 = T(n.id + (ci ? ' (cont.)' : ''), x + 4, y + 4.4, { size: 6.8, bold: true })
        T(cat?.label ?? '', x + 4 + w1 + 2.4, y + 4.4, { font: 'sans', size: 5.8, color })
        if (ci === 0) T(`${n.validity?.startStr ?? ''} – ${n.validity?.endStr ?? ''}`, x + w - 3, y + 4.4, { size: 5.4, color: P.dim, align: 'right', cs: 0.1 })
        TL(ls, x + 4, y + 8.4, lh, { size, color: P.ink2 })
      } }
    })
  }

  const HZ = { TS: P.red, TURB: P.orange, VA: P.purple }
  const sigmetCard = (w, s) => {
    const c = HZ[s.hazard] ?? P.dim, rawLines = wrap(s.raw, w - 9, { size: 5.7 }), exp = s.expired ? 3.6 : 0
    const h = 3 + 3.6 + exp + (s.line ? 3.8 : 0.6) + rawLines.length * 2.6 + 3
    return { h, draw: (x, y, H2 = h) => {
      rr(x, y, w, H2, 1.2, P.card, line2); fill(s.expired ? P.red : c); doc.rect(x, y + 0.3, 0.8, H2 - 0.6, 'F')
      let cx = x + 4
      cx += T(s.title, cx, y + 4.6, { size: 6.6, bold: true, color: s.expired ? P.dim : c, cs: 0.2 }) + 2.4
      T(s.fir, cx, y + 4.6, { size: 5.6, color: P.dim })
      T(s.time, x + w - 3, y + 4.6, { size: 5.4, color: P.dim, align: 'right', cs: 0.1 })
      let yy = y + 8.2
      if (s.expired) { T('EXPIRED — DO NOT USE FOR PLANNING', x + 4, yy, { size: 5.8, bold: true, color: P.red, cs: 0.1 }); yy += 3.6 }
      if (s.line) { T(s.line, x + 4, yy, { size: 6.6 }); yy += 3.8 } else yy -= 3.2
      TL(rawLines, x + 4, yy + 3.9, 2.6, { size: 5.7, color: P.dim })
    } }
  }

  // ── Flight details pieces ────────────────────────────────────────────────
  const d = model.flight
  const info = d?.info ?? {}
  const boardingPass = w => cardUnit(w, 66, (x, y) => {
    const ix = x + 4, iw = w - 8, c3 = iw / 4
    field(ix, y + 5.5, 'FLIGHT', d.flight, d.commercialNo)
    field(ix + c3, y + 5.5, 'TAIL', info.tail, info.type, { maxW: c3 * 2 - 3 })
    field(ix + c3 * 3, y + 5.5, 'OFP NO.', info.ofpNo, d.routeNo && `RTE ${d.routeNo}`)
    const ry = y + 22.5
    const aw = T(d.dep, ix, ry, { size: 14, cs: 0.4 }), bw = tw(d.arr, { size: 14, cs: 0.4 })
    T(d.arr, ix + iw, ry, { size: 14, cs: 0.4, align: 'right' })
    const mx = ix + iw / 2, ly = ry - 2.2
    dashed(ix + aw + 3, ly, mx - 5, ly, P.dim, 0.3); dashed(mx + 5, ly, ix + iw - bw - 3, ly, P.dim, 0.3)
    planeIcon(mx, ly, 0.78, P.acc)
    T(lookupAirport(d.dep)?.name ?? '', ix, ry + 4.6, { size: 5.8, color: P.dim, maxW: iw / 2 - 2 })
    T(lookupAirport(d.arr)?.name ?? '', ix + iw, ry + 4.6, { size: 5.8, color: P.dim, align: 'right', maxW: iw / 2 - 2 })
    const time = (lab, iso, tz, xx, align) => {
      const u = iso && utcParts(iso), l = iso && localParts(iso, tz)
      label(lab, xx, ry + 10, { align }); T(u ? u.time : '—', xx, ry + 15, { size: 11, align })
      if (u) T(`${u.date} · UTC`, xx, ry + 18.2, { size: 5.6, color: P.dim, align, cs: 0.1 })
      if (l) { T(`${l.time} ${l.offset}`, xx, ry + 24, { size: 9, align }); T(`${l.date} · LOCAL`, xx, ry + 27.2, { size: 5.6, color: P.dim, align, cs: 0.1 }) }
    }
    time('STD', info.std, d.depTz, ix, 'left'); time('STA', info.sta, d.arrTz, ix + iw, 'right')
    hline(ix, y + 53, ix + iw, line1)
    field(ix, y + 56.2, 'BLOCK', fmtHm(info.std && info.sta ? blockMinutes(info.std, info.sta) : null))
    field(ix + c3, y + 56.2, 'TRIP', fmtHm(info.tripMin))
    field(ix + c3 * 2, y + 56.2, 'COST INDEX', d.costIndex)
    field(ix + c3 * 3, y + 56.2, 'DISTANCE', info.distNm != null ? `${info.distNm.toLocaleString('en-US')} NM` : null, d.gcdNm != null ? `GCD ${d.gcdNm.toLocaleString('en-US')}` : null)
  })

  const fuelCard = (w, fuel) => {
    const parts = fuelParts(fuel)
    return cardUnit(w, 4.5 + 14 + 6.5 + parts.length * 4.9 + 10.5, (x, y) => {
      const ix = x + 4, iw = w - 8
      sectionTitle(ix, y + 6, 'FUEL (KG)')
      ;[['BLOCK FUEL', fuel.block, P.acc], ['EST T/OFF FUEL', fuel.takeoff], ['ARRIVAL FUEL', fuel.arrival != null && { kg: fuel.arrival }]].forEach(([lab, f, col], i) => {
        const cx = ix + (iw / 3) * i
        label(lab, cx, y + 11.2, { size: 4.6, cs: 0.1 }); T(f ? kg(f.kg) : '—', cx, y + 16.6, { size: 11.5, color: col ?? P.ink })
        T(f?.min != null ? fmtHm(f.min) : '', cx, y + 19.8, { size: 5.6, color: P.dim })
      })
      const total = parts.reduce((n, p) => n + p.kg, 0), gap = 0.7, bw = iw - gap * (parts.length - 1)
      let bx = ix; parts.forEach(p => { const sw = Math.max(0.6, bw * p.kg / total); fill(FUEL_COLORS[p.key]); doc.rect(bx, y + 22.8, sw, 2.4, 'F'); bx += sw + gap })
      let yy = y + 31.5
      parts.forEach((p, i) => {
        fill(FUEL_COLORS[p.key]); doc.roundedRect(ix, yy - 2.3, 2, 2, 0.3, 0.3, 'F')
        T(p.label, ix + 4, yy - 0.5, { font: 'sans', size: 6.4, color: P.dim })
        T(kg(p.kg), ix + iw - 13, yy - 0.5, { size: 6.6, align: 'right' }); T(fmtHm(p.min) ?? '', ix + iw, yy - 0.5, { size: 6.2, color: P.dim, align: 'right' })
        if (i < parts.length - 1) dashed(ix, yy + 1.5, ix + iw, yy + 1.5, line1)
        yy += 4.9
      })
      if (fuel.minDiversion) T(`Min diversion fuel ${kg(fuel.minDiversion.kg)} (${fmtHm(fuel.minDiversion.min)})`, ix, yy + 1.2, { font: 'sans', size: 5.8, color: P.dim })
    })
  }
  const LEVEL = { green: P.green, amber: P.yellow, red: P.red }
  const weightsCard = (w, wt) => {
    const rows = [['ZFW', wt.zfw], ['TOW', wt.tow], ['LDW', wt.ldw]].filter(r => r[1])
    return cardUnit(w, 4.5 + 6 + 2 * 5.2 + 3 + rows.length * 8.4 + 8, (x, y) => {
      const ix = x + 4, iw = w - 8
      sectionTitle(ix, y + 6, 'WEIGHTS (KG)')
      let yy = y + 12.6
      ;[['DOW', wt.dow], ['Payload', wt.payload]].forEach(([k, v], i) => {
        T(k, ix, yy, { font: 'sans', size: 6.4, color: P.dim }); T(kg(v), ix + iw, yy, { size: 6.8, align: 'right' })
        if (i === 0) dashed(ix, yy + 1.6, ix + iw, yy + 1.6, line1)
        yy += 5.2
      })
      yy += 2.6
      for (const [k, v] of rows) {
        const pct = pctOfLimit(v.kg, v.max), lvl = weightLevel(pct)
        T(k, ix, yy, { font: 'sans', size: 6.4, color: P.dim })
        T(`${kg(v.kg)}${v.max != null ? ` / ${kg(v.max)}` : ''}${pct != null ? ` · ${pct.toFixed(1)}%` : ''}`, ix + iw, yy, { size: 6.4, align: 'right' })
        if (lvl) { rr(ix, yy + 1.2, iw, 1.4, 0.7, P.box); rr(ix, yy + 1.2, Math.max(1.4, iw * Math.min(100, pct) / 100), 1.4, 0.7, LEVEL[lvl]) }
        yy += 8.4
      }
      let lx = ix
      ;[['green', 'up to 70%'], ['amber', '71 to 80%'], ['red', '81%+']].forEach(([k, t]) => {
        fill(LEVEL[k]); doc.roundedRect(lx, yy - 1.9, 1.9, 1.9, 0.3, 0.3, 'F'); lx += 3.2
        lx += T(t, lx, yy - 0.3, { font: 'sans', size: 5.6, color: P.dim }) + 4
      })
    })
  }

  const routeCard = w => {
    const routeLines = wrap(d.route ?? '', w - 8, { size: 7 }), firs = d.firs ?? []
    return cardUnit(w, 6 + 6.5 + routeLines.length * 3.5 + (firs.length ? 9 + 5 + 8 : 0) + 4, (x, y) => {
      const ix = x + 4
      sectionTitle(ix, y + 6, 'ROUTE AND FIRS')
      let cx = ix; cx += chip(cx, y + 12.8, d.dep, fx(ROLE_COLORS.DEPARTURE)) + 1.8; chip(cx, y + 12.8, d.arr, fx(ROLE_COLORS.ARRIVAL))
      TL(routeLines, ix, y + 19.6, 3.5, { size: 7 })
      let yy = y + 19.6 + routeLines.length * 3.5 + 1.6
      if (firs.length) {
        hline(ix, yy, x + w - 4, line1); yy += 5
        label('FIRs IN ORDER · TIME INTO FLIGHT', ix, yy); yy += 5.6
        let fx0 = ix
        firs.forEach((f, i) => {
          const cw = chip(fx0, yy, f.icao, P.fir, true)
          T(fmtHm(f.min) ?? '', fx0 + cw / 2, yy + 4.2, { size: 5.8, color: P.dim, align: 'center' })
          fx0 += cw + 1.2
          if (i < firs.length - 1) { T('›', fx0, yy, { font: 'sans', size: 7, color: P.dim }); fx0 += 3.8 }
        })
      }
    })
  }

  // The OFP can plan more alternates than the flight plan files: show the filed ones (as the Flight Details tab does).
  const alts = d?.alternates ?? [], enroute = d?.enrouteAlts ?? []
  const filed = d?.destAlts ?? alts.slice(0, 2).map(a => a.icao)
  const shown = alts.filter(a => filed.includes(a.icao)), unfiled = alts.filter(a => !filed.includes(a.icao))
  const altNotes = [unfiled.length && `The OFP lists ${unfiled.length} more: ${unfiled.map(a => a.icao).join(', ')}.`, d?.takeoffAlt && `Take-off alternate: ${d.takeoffAlt}.`, d?.edto && `EDTO/ETP: ${d.edto}.`].filter(Boolean).join(' ')
  const altStats = a => [['DIST', a.distNm != null && `${a.distNm} NM`], ['LEVEL', a.fl != null && `FL${a.fl}`], ['W/C', a.wc != null && `${fmtWc(a.wc)} kt`], ['TIME', fmtHm(a.min)], ['FUEL', a.fuel != null && kg(a.fuel)], ['MORA', a.mora != null && `${kg(a.mora)} ft`]].filter(([, v]) => v)
  const altCard = w => cardUnit(w, 6 + shown.length * 24 + (enroute.length ? 5 + 6.5 : 0) + (altNotes ? 5 : 0) + 3, (x, y) => {
    const ix = x + 4, iw = w - 8
    sectionTitle(ix, y + 6, 'ALTERNATES')
    let yy = y + 12.4
    shown.forEach((a, i) => {
      if (i) hline(ix, yy - 4.4, ix + iw, line1)
      const cw = chip(ix, yy, a.icao, fx(ROLE_COLORS[`DESTINATION ALTERNATE ${i + 1}`] ?? '#94a3b8'))
      T(`ALT ${i + 1}${lookupAirport(a.icao)?.name ? ` · ${lookupAirport(a.icao).name}` : ''}`, ix + cw + 2, yy - 0.2, { font: 'sans', size: 5.8, color: P.dim, maxW: iw - cw - 2 })
      T(a.route, ix, yy + 5.4, { size: 7, maxW: iw })
      const stats = altStats(a)
      stats.forEach(([k, v], j) => field(ix + (iw / stats.length) * j, yy + 9.4, k, v, null, { size: 8 }))
      yy += 24
    })
    if (enroute.length) {
      if (shown.length) hline(ix, yy - 4.4, ix + iw, line1)
      label('ENROUTE', ix, yy); let cx = ix
      enroute.forEach((c, i) => { cx += chip(cx, yy + 5.6, c, fx(ROLE_COLORS[`ENROUTE ALTERNATE ${i + 1}`] ?? '#94a3b8')) + 1.8 })
      yy += 12
    }
    if (altNotes) T(altNotes, ix, yy, { font: 'sans', size: 5.8, color: P.dim, maxW: iw })
  })

  // Label / value rows, the value wrapped and right-aligned in the space left of the label column.
  const kvCard = (w, title, rows, { cols = 1, labelW = 24, nameInk = false, right = null } = {}) => {
    const cw = (w - 8 - (cols - 1) * 5) / cols, vw = cw - labelW - 2
    const items = rows.map(([k, v]) => ({ k, lines: wrap(v, vw, { size: 6.8 }) })).map(r => ({ ...r, h: Math.max(1, r.lines.length) * 3.1 + 2.3 }))
    const per = Math.ceil(items.length / cols), colItems = Array.from({ length: cols }, (_, c) => items.slice(c * per, (c + 1) * per))
    const bodyH = Math.max(...colItems.map(ci => ci.reduce((n, r) => n + r.h, 0)))
    return cardUnit(w, 6 + 4 + bodyH + 3, (x, y) => {
      const ix = x + 4
      sectionTitle(ix, y + 6, title)
      if (right) T(right, x + w - 4, y + 6, { font: 'sans', size: 5.8, color: P.dim, align: 'right' })
      colItems.forEach((ci, c) => {
        const cx = ix + c * (cw + 5); let yy = y + 13
        ci.forEach((r, i) => {
          T(r.k, cx, yy, { font: 'sans', size: 6.4, color: nameInk ? P.ink : P.dim, maxW: labelW })
          r.lines.forEach((l, j) => T(l, cx + cw, yy + j * 3.1, { size: 6.8, align: 'right' }))
          if (i < ci.length - 1) dashed(cx, yy + r.h - 3.3, cx + cw, yy + r.h - 3.3, line1)
          yy += r.h
        })
      })
    })
  }
  const dutyCard = w => {
    const u = model.duty
    const items = [['FLIGHT NO.', u.fltNo], ['DATE', u.date], ['AIRCRAFT', u.aircraft], ['FROM / TO', [u.from, u.dest].filter(Boolean).join(' / ')],
      ['OFF BLOCKS', u.offBlk], ['TAKE-OFF', u.takeoff], ['LANDING', u.ldg], ['ON BLOCKS', u.onBlk],
      ['FUEL OFF', u.fuelOff], ['FUEL ON', u.fuelOn], ['PAX', u.pax], ['BLOCK TIME', u.block]]
    const cols = landscape ? 6 : 4, rows = Math.ceil(items.length / cols), remark = u.remark ? wrap(u.remark, w - 8, { font: 'sans', size: 7 }) : []
    return cardUnit(w, 6 + 4 + rows * 11.2 + (remark.length ? 5 + remark.length * 3.4 : 0) + 3, (x, y) => {
      const ix = x + 4, iw = w - 8
      sectionTitle(ix, y + 6, 'DUTY LOG · LINKED SECTOR')
      T('linked by you', x + w - 4, y + 6, { font: 'sans', size: 5.8, color: P.dim, align: 'right' })
      items.forEach(([k, v], i) => field(ix + (iw / cols) * (i % cols), y + 12 + Math.floor(i / cols) * 11.2, k, v || '—', null, { size: 8.4, maxW: iw / cols - 2 }))
      if (remark.length) { const ry = y + 12 + rows * 11.2; label('REMARK', ix, ry); TL(remark, ix, ry + 4.4, 3.4, { font: 'sans', size: 7, color: P.ink2 }) }
    })
  }

  const mapCard = w => {
    const props = doc.getImageProperties(model.map), aspect = props.height / props.width
    const ih = Math.min((w - 0.5) * aspect, H - 2 * TOP - 19 - 3 - 7.2 - 3), iw = ih / aspect
    return { h: 7.2 + ih, draw: (x, y) => {
      rr(x, y, w, 7.2 + ih, 1.4, P.card, line2)
      label('ROUTE & ALTERNATES', x + 4, y + 4.6, { size: 5.4 })
      doc.addImage(model.map, props.fileType, x + (w - iw) / 2, y + 7.2 - 0.25, iw, ih)
    } }
  }

  // ── page-level blocks ────────────────────────────────────────────────────
  const blocks = []
  const add = (unit, o = {}) => blocks.push({ ...unit, gap: o.gap ?? 4, sec: o.sec, keep: o.keep, newPage: o.newPage, x: o.x ?? M })
  // `newPage`: the heading starts a fresh page (unless the page holds nothing but the title block).
  const heading = (text, count, newPage = false) => add({ h: 8, draw: (x, y) => {
    hline(x, y + 6.6, x + CW, line2, 0.25)
    const lw = tw(text.toUpperCase(), { size: 6.4, cs: 0.4 })
    fill(P.acc); doc.rect(x, y + 6.4, lw + (count != null ? 12 : 4) + 3, 0.5, 'F')
    T(text.toUpperCase(), x + 2, y + 4.6, { size: 6.4, color: P.acc, cs: 0.4 })
    if (count != null) { const cx = x + 2 + lw + 3; rr(cx, y + 1.6, 7.5, 4, 2, P.box); T(String(count), cx + 3.75, y + 4.5, { size: 5.4, bold: true, align: 'center' }) }
  } }, { keep: true, gap: 3, newPage })
  const pair = (u1, u2) => { const hh = Math.max(u1.h, u2.h); return { h: hh, draw: (x, y) => { u1.draw(x, y, hh); u2.draw(x + (CW + 3) / 2, y, hh) } } }
  const SP = 4, TITLE = 8
  // A tinted section holding a grid of cards.
  const section = (title, color, items, make, cols) => {
    if (!items.length) return
    const sec = { title, color }, iw = CW - 2 * SP, g = 3, cw = (iw - g * (cols - 1)) / cols
    const units = items.map(it => make(cw, it))
    for (let i = 0; i < units.length; i += cols) {
      const row = units.slice(i, i + cols), rh = Math.max(...row.map(u => u.h))
      add({ h: rh, draw: (x, y) => row.forEach((u, j) => u.draw(x + j * (cw + g), y, rh)) }, { sec, x: M + SP, gap: g })
    }
  }
  const stack = (title, color, groups) => { // groups: [{ head, units }] — blocks that may split across pages
    const sec = { title, color }, iw = CW - 2 * SP
    groups.forEach(g => {
      add(g.head(iw), { sec, x: M + SP, gap: 2, keep: true })
      g.entries.flatMap(e => e(iw)).forEach((u, i, arr) => add(u, { sec, x: M + SP, gap: i === arr.length - 1 ? 4 : 2 }))
    })
  }

  // 0 ── title block (like the overlay's header)
  const fallbackName = `${model.dep ?? ''} → ${model.arr ?? ''}`
  add({ h: 19, draw: (x, y) => {
    T(model.withLog ? 'FLIGHT BRIEFING AND DUTY LOGS' : 'FLIGHT BRIEFING', x + 1, y + 3.4, { size: 5.6, color: P.dim, cs: 0.4 })
    let cx = x + 1; const tsz = { size: 11, bold: true, font: 'sans' }
    String(model.name || fallbackName).split('→').forEach((part, i) => {
      if (i) {
        cx += 1.6; stroke(P.ink); doc.setLineWidth(0.35); doc.line(cx, y + 7.9, cx + 4.6, y + 7.9); doc.line(cx + 3.2, y + 6.5, cx + 4.6, y + 7.9); doc.line(cx + 3.2, y + 9.3, cx + 4.6, y + 7.9); cx += 6.2
      }
      cx += T(part.trim(), cx, y + 10, { ...tsz, maxW: x + CW - cx }) + 1
    })
    T(`${model.dep ?? ''} TO ${model.arr ?? ''} · GENERATED ON ${model.generated}`.toUpperCase(), x + 1, y + 16, { size: 5.6, color: P.dim, cs: 0.25 })
    hline(x, y + 18, x + CW, line2, 0.3)
  } }, { gap: 3 })

  // 1 ── route map
  if (model.map) add(mapCard(CW))
  // 2 ── flight details
  if (d) {
    heading('Flight details')
    add(boardingPass(CW), { gap: 3 })
    const hw = (CW - 3) / 2
    if (d.fuel && d.weights) add(pair(fuelCard(hw, d.fuel), weightsCard(hw, d.weights)), { gap: 3 })
    else if (d.fuel) add(fuelCard(CW, d.fuel), { gap: 3 })
    else if (d.weights) add(weightsCard(CW, d.weights), { gap: 3 })
    add(routeCard(CW), { gap: 3 })
    if (shown.length || enroute.length || altNotes) add(altCard(CW), { gap: 3 })
    const r = d.remarks
    const remarkRows = r ? [r.occ?.length && ['OCC contact', r.occ.join(' · ')], r.melCdl && ['MEL/CDL', r.melCdl], ...(r.notes ?? []).map(n => [`Note ${n.n}`, n.text]), r.notam && ['NOTAM', r.notam]].filter(Boolean) : []
    if (remarkRows.length) add(kvCard(CW, 'DISPATCH REMARKS', remarkRows, { labelW: 22 }))
  }
  // 3/4 ── duty log + crew
  if (model.duty || model.crew) {
    heading(model.duty && model.crew ? 'Duty log & crew' : model.duty ? 'Duty log' : 'Crew')
    if (model.duty) add(dutyCard(CW), { gap: 3 })
    if (model.crew) add(kvCard(CW, 'CREW · FROM THE LINKED DUTY LOG', model.crew.map(c => [c.name || '—', c.position]), { cols: landscape ? 2 : 1, labelW: 45, nameInk: true }))
  }
  // 5 ── METAR/TAF
  const wx = model.weather
  if (wx) {
    heading('METAR/TAF', wx.depArr.length + wx.destAlt.length + wx.era.length, true)
    section('Departure & Arrival', SEC.depArr, wx.depArr, weatherCard, 2)
    section('Destination Alternates', SEC.destAlt, wx.destAlt, weatherCard, 2)
    section('Enroute Alternates', SEC.era, wx.era, weatherCard, landscape ? 3 : 2)
  }
  // 6 ── SIGMETs
  if (model.sigmets) {
    heading('SIGMETs', model.sigmets.length, true)
    section('Sigmets — Route Firs', SEC.sigmet, model.sigmets, sigmetCard, 1)
  }
  // 7 ── NOTAMs
  const nt = model.notams
  if (nt) {
    heading('NOTAMs', nt.total, true)
    const groups = ls => ls.map(l => ({ head: w => notamHeader(w, l), entries: l.notams.map(n => w => notamEntries(w, n)) }))
    if (nt.airports.length) stack('Notams — Airports', SEC.notam, groups(nt.airports))
    if (nt.firs.length) stack('Notams — Route Firs', SEC.notam, groups(nt.firs))
  }

  // ── paginate ─────────────────────────────────────────────────────────────
  const pages = [[]]; let y = TOP
  blocks.forEach((b, i) => {
    const prev = pages.at(-1).at(-1)?.sec ?? null
    const newSeg = b.sec && (!prev || prev !== b.sec)
    const next = blocks[i + 1]
    const need = b.h + (newSeg ? SP + TITLE : 0) + (b.sec ? SP : 0) + (b.keep && next ? next.h + (next.sec && next.sec !== b.sec ? SP + TITLE + SP : 0) + 3 : 0)
    const breakNow = y + need > BOT || (b.newPage && pages.at(-1).some(it => it.b !== blocks[0]))
    if (breakNow && y > TOP) { pages.push([]); y = TOP }
    const last = pages.at(-1).at(-1), segStart = !!b.sec && (!last || last.sec !== b.sec)
    const by = y + (segStart ? SP + TITLE : 0)
    pages.at(-1).push({ b, y: by, sec: b.sec, segStart })
    y = by + b.h + b.gap
    if (b.sec && blocks[i + 1]?.sec !== b.sec) y += SP + 4 - b.gap
  })

  // ── draw ─────────────────────────────────────────────────────────────────
  const seen = new Set()
  pages.forEach((items, pi) => {
    if (pi > 0) doc.addPage()
    fill(P.page); doc.rect(0, 0, W, H, 'F')
    const segs = []
    items.forEach(it => {
      if (!it.sec) return
      const s = segs.at(-1)
      if (s && s.sec === it.sec && !it.segStart) s.end = it.y + it.b.h
      else segs.push({ sec: it.sec, start: it.y - SP - TITLE, end: it.y + it.b.h })
    })
    segs.forEach(s => {
      const c = s.sec.color, first = !seen.has(s.sec); seen.add(s.sec)
      rr(M, s.start, CW, s.end + SP - s.start, 2.2, mix(P.page, c, 0.06), mix(P.page, c, 0.2), 0.25)
      const tl = T(s.sec.title.toUpperCase() + (first ? '' : ' · CONT.'), M + SP, s.start + SP + 2.2, { size: 6.2, color: fx(c), cs: 0.4 })
      hline(M + SP + tl + 3, s.start + SP + 1.5, M + CW - SP, mix(P.page, c, 0.35), 0.25)
    })
    items.forEach(it => it.b.draw(it.b.x, it.y))
  })

  const n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p)
    T('ClaudeBorne SuperApp · For reference only', M, H - 5.5, { font: 'sans', size: 5.8, color: P.dim })
    T(`Page ${p} of ${n}`, W - M, H - 5.5, { font: 'sans', size: 5.8, color: P.dim, align: 'right' })
  }
  return doc.output('arraybuffer')
}

/** Builds the PDF and hands it to the browser as a download. */
export async function exportBriefingPdf(model, opts) {
  const buf = await renderBriefingPdf(model, opts, await loadPdfFonts())
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = pdfFileName(model.name || `${model.dep}-${model.arr}`)
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
