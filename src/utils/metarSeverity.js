/**
 * METAR / TAF severity colour utilities.
 *
 * Flight categories
 *   VFR  – ceiling > 3 000 ft  AND  vis > 5 SM    → green  #22c55e
 *   MVFR – ceiling 1 000–3 000 ft  OR  vis 3–5 SM → blue   #60a5fa
 *   IFR  – ceiling 500–999 ft      OR  vis 1–3 SM → red    #f87171
 *   LIFR – ceiling < 500 ft        OR  vis < 1 SM → magenta #e879f9
 *
 * Wind severity (token-level, independent of flight category)
 *   NORMAL – spd < 20 kt  AND  gust < 25 kt → no override
 *   STRONG – spd 20–34 kt OR  gust 25–44 kt → amber  #fbbf24
 *   SEVERE – spd ≥ 35 kt  OR  gust ≥ 45 kt → red    #f87171
 *
 * Significant weather floors
 *   FC / +TS / TSGR           → LIFR floor
 *   TS (any) / FZ (any)       → IFR  floor
 */

// ── Colour palettes ──────────────────────────────────────────────────────────
export const CAT_COLORS = {
  VFR:  '#22c55e',
  MVFR: '#60a5fa',
  IFR:  '#f87171',
  LIFR: '#e879f9',
}

export const WIND_COLORS = {
  STRONG: '#fbbf24',
  SEVERE: '#f87171',
}

// ── Internal ordering helpers ────────────────────────────────────────────────
const ORD = ['VFR', 'MVFR', 'IFR', 'LIFR']

function worst(a, b) {
  // null means "no data" — treat as VFR (optimistic) when the other side is known
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  return ORD[Math.max(ORD.indexOf(a), ORD.indexOf(b))]
}

function visCat(sm) {
  if (sm == null) return null
  if (sm < 1)  return 'LIFR'
  if (sm < 3)  return 'IFR'
  if (sm < 5)  return 'MVFR'
  return 'VFR'
}

function ceilCat(ft) {
  if (ft == null) return null
  if (ft < 500)   return 'LIFR'
  if (ft < 1000)  return 'IFR'
  if (ft <= 3000) return 'MVFR'
  return 'VFR'
}

function applyWxFloor(cat, wx) {
  if (!wx) return cat
  const w = wx.toUpperCase()
  // FC, heavy thunderstorm → LIFR floor
  if (/\bFC\b|\+TSRA|\+TS\b|TSGR/.test(w)) return worst(cat, 'LIFR')
  // Any TS, any FZ → IFR floor
  if (/\bTS\b|\bFZ/.test(w)) return worst(cat, 'IFR')
  return cat
}

// ── Public: flight category from structured METAR object ────────────────────
/**
 * Returns 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null.
 * null = could not determine (no usable ceiling/vis data).
 *
 * @param {object} m  METAR object from aviationweather.gov API
 *   m.rawOb   string  – raw METAR text (used for CAVOK/SKC/CLR/NSC detection)
 *   m.visib   number  – visibility in statute miles
 *   m.clouds  array   – [{cover, base}] ceiling layers
 *   m.wxString string – weather phenomena
 */
export function getMetarFlightCat(m) {
  if (!m) return null
  const raw = m.rawOb || ''
  const wx  = (m.wxString || '').toUpperCase()

  // CAVOK / unlimited sky codes → automatically VFR ceiling, apply wx floor
  if (/\b(CAVOK|CLR|SKC|NCD|NSC)\b/.test(raw)) {
    const visSm = m.visib != null ? parseFloat(m.visib) : null
    const base  = visSm != null ? (visCat(visSm) ?? 'VFR') : 'VFR'
    return applyWxFloor(base, wx)
  }

  const visSm  = m.visib != null ? parseFloat(m.visib) : null

  // Find ceiling = lowest BKN or OVC layer
  let ceiling = null
  if (Array.isArray(m.clouds)) {
    for (const c of m.clouds) {
      if ((c.cover === 'BKN' || c.cover === 'OVC') && c.base != null) {
        if (ceiling === null || c.base < ceiling) ceiling = c.base
      }
    }
  }

  const base = worst(visCat(visSm), ceilCat(ceiling))
  if (base === null) return null  // no usable data → no colour override

  return applyWxFloor(base, wx)
}

// ── Public: wind severity ────────────────────────────────────────────────────
/**
 * Returns 'NORMAL' | 'STRONG' | 'SEVERE'.
 * @param {number|string} wspd  wind speed in knots
 * @param {number|string} wgst  gust speed in knots (null/undefined = no gust)
 */
export function getWindSev(wspd, wgst) {
  const s = parseFloat(wspd) || 0
  const g = parseFloat(wgst) || 0
  if (s >= 35 || g >= 45) return 'SEVERE'
  if (s >= 20 || g >= 25) return 'STRONG'
  return 'NORMAL'
}

// ── Public: tokenise a METAR raw string ─────────────────────────────────────
/**
 * Splits rawOb on whitespace (preserving spaces), assigning each token a colour.
 * Wind tokens get the wind-severity colour; everything else gets catColor.
 *
 * @returns {Array<{text:string, color:string}>}
 */
export function tokenizeRaw(rawOb, catColor, windColor) {
  if (!rawOb) return [{ text: '—', color: catColor }]
  // Wind token: dddssKT or dddssGssKT or VRBssKT
  const windRe = /^(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?KT$/
  return rawOb.split(/(\s+)/).map(tok => ({
    text:  tok,
    color: windRe.test(tok) && windColor ? windColor : catColor,
  }))
}

// ── Public: parse a raw TAF string into coloured segments ───────────────────
/**
 * Splits rawTaf into forecast periods (BASE, FM, BECMG, TEMPO, PROB).
 * Each segment is independently categorised; wind tokens are coloured within
 * each segment.
 *
 * TEMPO / PROB segments are flagged as `isTemporal` (render at 70 % opacity).
 *
 * @returns {Array<{type, tokens, catColor, cat, isTemporal}> | null}
 */
export function parseTafSegments(rawTaf) {
  if (!rawTaf) return null

  // Normalise line endings, then insert a newline before every period marker
  // that isn't already at the start of a line.
  const normalised = rawTaf
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+(FM\d{6}|BECMG\b|TEMPO\b|PROB\d{2}\b)/g, '\n$1')

  const lines = normalised.split('\n').map(l => l.trim()).filter(Boolean)

  // Group lines into periods; a period starts when a marker keyword appears.
  const PERIOD_START = /^(FM\d{6}|BECMG|TEMPO|PROB\d{2})/
  const groups = []
  let cur = []

  for (const line of lines) {
    if (PERIOD_START.test(line) && cur.length > 0) {
      groups.push(cur.join(' '))
      cur = []
    }
    cur.push(line)
  }
  if (cur.length > 0) groups.push(cur.join(' '))

  if (groups.length === 0) return null

  const windRe = /^(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?KT$/

  return groups.map(text => {
    // Determine segment type
    const type = /^FM/.test(text)    ? 'FM'
      : /^BECMG/.test(text)          ? 'BECMG'
      : /^TEMPO/.test(text)          ? 'TEMPO'
      : /^PROB/.test(text)           ? 'PROB'
      : 'BASE'

    const isTemporal = type === 'TEMPO' || type === 'PROB'

    // Categorise this segment
    const cat      = _categorizeTafText(text)
    const catColor = cat ? CAT_COLORS[cat] : null

    // Wind severity for this segment
    const windSev   = _parseTafWindSev(text)
    const windColor = windSev !== 'NORMAL' ? (WIND_COLORS[windSev] ?? null) : null

    // Tokenise: wind token → windColor, rest → catColor
    const tokens = text.split(/(\s+)/).map(tok => ({
      text:  tok,
      color: windRe.test(tok) && windColor ? windColor : catColor,
    }))

    return { type, text, tokens, catColor, cat, isTemporal }
  })
}

// ── Internal TAF helpers ─────────────────────────────────────────────────────
function _categorizeTafText(text) {
  // Unlimited sky codes → VFR base
  if (/\b(CAVOK|SKC|NCD|NSC)\b/.test(text)) {
    const visSm = _parseTafVisSm(text)
    const vc    = visSm != null ? (visCat(visSm) ?? 'VFR') : 'VFR'
    return applyWxFloor(vc, _parseTafWxStr(text))
  }

  const visSm  = _parseTafVisSm(text)
  const ceiling = _parseTafCeilFt(text)
  const base    = worst(visCat(visSm), ceilCat(ceiling))
  const safeBase = base ?? 'VFR'  // default optimistic when both null (e.g. continuation line)

  return applyWxFloor(safeBase, _parseTafWxStr(text))
}

function _parseTafVisSm(text) {
  // US format: "5SM", "1/2SM", "1 1/2SM"
  const smMatch = text.match(/\b(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*SM\b/)
  if (smMatch) {
    const parts = smMatch[1].trim().split(/\s+/)
    let val = 0
    for (const p of parts) {
      if (p.includes('/')) {
        const [n, d] = p.split('/')
        val += parseFloat(n) / parseFloat(d)
      } else {
        val += parseFloat(p)
      }
    }
    return val
  }
  // ICAO metric: 4-digit 0400–9998 (not inside a cloud group or time group)
  // Must not be preceded directly by BKN/FEW/SCT/OVC or a /
  const mMatch = text.match(/(?<![A-Z\/])(\b(?:0[4-9]\d{2}|[1-8]\d{3}|9999)\b)(?!\s*FT)/)
  if (mMatch) {
    const v = parseInt(mMatch[1])
    if (v === 9999) return 10
    // Only treat as visibility if within plausible range
    if (v >= 400 && v <= 9998) return v / 1609.34
  }
  return null
}

function _parseTafCeilFt(text) {
  const re = /\b(BKN|OVC)(\d{3})\b/g
  let ceil = null, m
  while ((m = re.exec(text)) !== null) {
    const b = parseInt(m[2]) * 100
    if (ceil === null || b < ceil) ceil = b
  }
  return ceil
}

function _parseTafWxStr(text) {
  const m = text.match(/\b(\+?(?:TS|FZ|FC|GR|GS|SN|RA|DZ)\S*)\b/g)
  return m ? m.join(' ').toUpperCase() : ''
}

function _parseTafWindSev(text) {
  const m = text.match(/\b(?:VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT\b/)
  if (!m) return 'NORMAL'
  return getWindSev(parseInt(m[1]) || 0, parseInt(m[2]) || 0)
}
