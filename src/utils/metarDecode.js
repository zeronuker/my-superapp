/**
 * METAR / TAF plain-English decoder.
 *
 * METAR fields come from the structured aviationweather.gov object where they
 * are reliable (wind, temp, dew, QNH); visibility, weather and cloud are
 * decoded from the raw token text so the ICAO units (metres) are preserved.
 *
 * TAF is raw-text only, so it is decoded entirely from tokens, reusing
 * parseTafSegments() to split forecast periods.
 */
import { parseTafSegments } from './metarSeverity'

// ── Weather phenomena dictionaries ───────────────────────────────────────────
const PHEN = {
  DZ: 'drizzle', RA: 'rain', SN: 'snow', SG: 'snow grains', IC: 'ice crystals',
  PL: 'ice pellets', GR: 'hail', GS: 'small hail', BR: 'mist', FG: 'fog',
  FU: 'smoke', VA: 'volcanic ash', DU: 'widespread dust', SA: 'sand', HZ: 'haze',
  PO: 'dust/sand whirls', SQ: 'squalls', FC: 'funnel cloud',
  SS: 'sandstorm', DS: 'duststorm',
}
const DESC_WITH = {
  TS: 'thunderstorm with', SH: 'showers of', FZ: 'freezing', BL: 'blowing',
  DR: 'low drifting', MI: 'shallow', BC: 'patches of', PR: 'partial',
}
const DESC_ALONE = {
  TS: 'thunderstorm', SH: 'showers', FZ: 'freezing', BL: 'blowing',
  DR: 'low drifting', MI: 'shallow', BC: 'patches', PR: 'partial',
}

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Decode a present-weather token (e.g. "+TSRA", "VCSH", "RETSRA"). */
export function decodeWeather(token) {
  let s = token, recent = false, vicinity = false, intensity = ''

  if (s.startsWith('RE')) { recent = true; s = s.slice(2) }
  if (s.startsWith('VC')) { vicinity = true; s = s.slice(2) }
  if (s[0] === '+') { intensity = 'heavy'; s = s.slice(1) }
  else if (s[0] === '-') { intensity = 'light'; s = s.slice(1) }

  let desc = null
  if (DESC_WITH[s.slice(0, 2)]) { desc = s.slice(0, 2); s = s.slice(2) }

  const phen = []
  while (s.length >= 2 && PHEN[s.slice(0, 2)]) { phen.push(PHEN[s.slice(0, 2)]); s = s.slice(2) }

  // Unrecognised leftover → return the raw token unchanged
  if (!desc && phen.length === 0) return token

  const phenStr = phen.join(' and ')
  const parts = []
  if (intensity) parts.push(intensity)
  if (desc) {
    if (phen.length) { parts.push(DESC_WITH[desc]); parts.push(phenStr) }
    else parts.push(DESC_ALONE[desc])
  } else {
    parts.push(phenStr)
  }

  let phrase = parts.join(' ')
  if (vicinity) phrase += ' in the vicinity'
  if (recent) phrase = 'recent ' + phrase
  return cap(phrase)
}

// ── Wind ──────────────────────────────────────────────────────────────────────
/** Decode wind from structured fields. */
export function decodeWind(wdir, wspd, wgst) {
  const spd = parseInt(wspd)
  if ((wdir === 0 || wdir === '000') && spd === 0) return 'Calm'
  if (!spd && wdir == null) return null

  const dir = wdir === 'VRB' ? 'Variable' : `${wdir}°`
  let s = `${dir} at ${spd} kt`
  const g = parseInt(wgst)
  if (g) s += `, gusting ${g} kt`
  return s
}

/** Decode a wind token (e.g. "24022G34KT", "VRB03KT", "00000KT"). */
export function decodeWindToken(tok) {
  const m = tok.match(/^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/)
  if (!m) return null
  const [, dir, spd, gst, unit] = m
  const u = unit === 'MPS' ? 'm/s' : 'kt'
  if (dir === '000' && spd === '00') return 'Calm'
  const dirStr = dir === 'VRB' ? 'Variable' : `${dir}°`
  let s = `${dirStr} at ${parseInt(spd)} ${u}`
  if (gst) s += `, gusting ${parseInt(gst)} ${u}`
  return s
}

// ── Visibility ──────────────────────────────────────────────────────────────
/** Decode a visibility token. Returns null if the token is not visibility. */
export function decodeVisToken(tok) {
  if (tok === 'CAVOK') return 'Ceiling and visibility OK'
  if (tok === '9999')  return '10 km or more'
  // ICAO 4-digit metres
  if (/^\d{4}$/.test(tok)) {
    const v = parseInt(tok)
    if (v >= 0 && v <= 9998) return `${v.toLocaleString()} m`
  }
  // US statute miles, incl. P (greater than) / M (less than) / fractions
  const sm = tok.match(/^(P|M)?(\d+(?:\s\d+\/\d+|\/\d+)?)SM$/)
  if (sm) {
    const prefix = sm[1] === 'P' ? 'More than ' : sm[1] === 'M' ? 'Less than ' : ''
    return `${prefix}${sm[2]} SM`
  }
  return null
}

// ── Cloud ─────────────────────────────────────────────────────────────────────
const COVER = { FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast' }

/** Decode a cloud token. Returns null if the token is not a cloud group. */
export function decodeCloudToken(tok) {
  if (tok === 'NSC') return 'No significant cloud'
  if (tok === 'NCD') return 'No cloud detected'
  if (tok === 'SKC') return 'Sky clear'
  if (tok === 'CLR') return 'Clear below 12,000 ft'
  if (tok === 'VV///' ) return 'Sky obscured'
  const vv = tok.match(/^VV(\d{3})$/)
  if (vv) return `Sky obscured, vertical visibility ${(parseInt(vv[1]) * 100).toLocaleString()} ft`

  const m = tok.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/)
  if (!m) return null
  const base = parseInt(m[2]) * 100
  let s = `${COVER[m[1]]} at ${base.toLocaleString()} ft`
  if (m[3] === 'CB')  s += ' (cumulonimbus)'
  if (m[3] === 'TCU') s += ' (towering cumulus)'
  return s
}

// ── METAR decode ─────────────────────────────────────────────────────────────
/**
 * Decode a structured METAR object into ordered { label, value } rows.
 * @returns {Array<{label:string, value:string}>}
 */
export function decodeMetar(m) {
  if (!m) return []
  const rows = []

  // Wind (structured)
  const wind = decodeWind(m.wdir, m.wspd, m.wgst)
  if (wind) rows.push({ label: 'Wind', value: wind })

  // Visibility / weather / cloud (from raw tokens — preserves ICAO units)
  const toks = (m.rawOb || '').split(/\s+/)
  let vis = null
  const wx = [], cloud = []
  for (const t of toks) {
    if (!vis) { const v = decodeVisToken(t); if (v) { vis = v; continue } }
    const c = decodeCloudToken(t); if (c) { cloud.push(c); continue }
  }
  // weather pass — skip cloud, visibility, wind, and known structural tokens
  for (const t of toks) {
    if (/^(FEW|SCT|BKN|OVC|VV)/.test(t)) continue
    if (decodeVisToken(t)) continue
    if (decodeWindToken(t)) continue
    if (/^\d{6}Z$/.test(t)) continue           // date-time group e.g. "261220Z"
    if (/^(METAR|SPECI|AUTO|COR|TAF|NIL|NOSIG|CAVOK)$/.test(t)) continue  // structural words
    const w = decodeWeather(t)
    if (w && w !== t) wx.push(w)
  }

  if (vis) rows.push({ label: 'Visibility', value: vis })
  if (wx.length) rows.push({ label: 'Weather', value: wx.join(', ') })
  if (cloud.length) rows.push({ label: 'Cloud', value: cloud.join(', ') })

  // Temperature / dew point (structured)
  if (m.temp != null && m.dewp != null) {
    const spread = Math.round((m.temp - m.dewp) * 10) / 10
    rows.push({
      label: 'Temp / Dew',
      value: `${m.temp}°C / ${m.dewp}°C  (spread ${spread}°C)`,
    })
  } else if (m.temp != null) {
    rows.push({ label: 'Temperature', value: `${m.temp}°C` })
  }

  // Pressure (structured)
  if (m.altim != null) {
    rows.push({ label: 'QNH', value: `${Math.round(m.altim)} hPa` })
  }

  // Trend
  if (/\bNOSIG\b/.test(m.rawOb || '')) {
    rows.push({ label: 'Trend', value: 'No significant change' })
  }

  return rows
}

// ── TAF decode ────────────────────────────────────────────────────────────────
function fmtDayHour(ddhh) {
  if (!/^\d{4}$/.test(ddhh)) return ddhh
  return `${ddhh.slice(0, 2)} ${ddhh.slice(2, 4)}:00Z`
}

function headerFor(type, text) {
  // Validity / from-time extraction
  const fm = text.match(/^FM(\d{2})(\d{2})(\d{2})/)
  if (fm) return `From ${fm[1]} ${fm[2]}:${fm[3]}Z`

  const period = text.match(/\b(\d{4})\/(\d{4})\b/)
  const span = period ? ` ${fmtDayHour(period[1])} → ${fmtDayHour(period[2])}` : ''

  if (type === 'BASE')  return `Base forecast${span ? ', valid' + span : ''}`
  if (type === 'BECMG') return `Becoming${span}`
  if (type === 'TEMPO') return `Temporarily${span}`
  if (type === 'PROB') {
    const p = text.match(/^PROB(\d{2})/)
    return `${p ? p[1] : ''}% probability${span}`
  }
  return type
}

/**
 * Decode a raw TAF into an array of forecast periods.
 * @returns {Array<{type, header, items:string[], isTemporal}> | null}
 */
export function decodeTaf(rawTaf) {
  const segs = parseTafSegments(rawTaf)
  if (!segs) return null

  return segs.map(({ type, text, isTemporal }) => {
    const items = []
    const toks = text.split(/\s+/)
    let vis = null
    const wx = [], cloud = []

    for (const t of toks) {
      const wind = decodeWindToken(t); if (wind) { items.push(`Wind: ${wind}`); continue }
      if (!vis) { const v = decodeVisToken(t); if (v) { vis = v; continue } }
      const c = decodeCloudToken(t); if (c) { cloud.push(c); continue }
    }
    for (const t of toks) {
      if (/^(FEW|SCT|BKN|OVC|VV)/.test(t)) continue
      if (decodeWindToken(t) || decodeVisToken(t)) continue
      const w = decodeWeather(t)
      if (w && w !== t && /[a-z]/.test(w)) wx.push(w)
    }

    if (vis) items.push(`Visibility: ${vis}`)
    if (wx.length) items.push(`Weather: ${wx.join(', ')}`)
    if (cloud.length) items.push(`Cloud: ${cloud.join(', ')}`)

    return { type, header: headerFor(type, text), items, isTemporal }
  })
}
