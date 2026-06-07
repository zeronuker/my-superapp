/**
 * METAR / TAF severity colour utilities.
 *
 * Flight categories — visibility thresholds in METRES (ICAO standard)
 *   VFR  – ceiling > 3 000 ft  AND  vis ≥ 8 000 m  → green   #22c55e
 *   MVFR – ceiling 1 000–3 000 ft  OR  vis 5 000–7 999 m → blue #60a5fa
 *   IFR  – ceiling 500–999 ft      OR  vis 1 500–4 999 m → red  #f87171
 *   LIFR – ceiling < 500 ft        OR  vis < 1 500 m     → magenta #e879f9
 *
 *   9999 in raw METAR = "10 km or more" → treated as 10 000 m (VFR)
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

// Present weather phenomena are always coloured yellow regardless of flight category.
export const WX_COLOR = '#facc15'

// Matches any METAR/TAF present-weather token:
//   optional RE (recent) or VC (vicinity)
//   optional intensity + or -
//   optional descriptor MI BC PR DR BL SH TS FZ
//   one or more phenomenon codes DZ RA SN SG IC PL GR GS BR FG FU VA DU SA HZ PO SQ FC SS DS
const WX_TOKEN_RE = /^(?:RE|VC)?[+-]?(?:MI|BC|PR|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)+$/

// Wind token: dddssKT, dddssGssKT or VRBssKT
const WIND_TOKEN_RE = /^(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?KT$/

// Cloud group carrying a convective type suffix — CB (cumulonimbus) or TCU
// (towering cumulus). These are operationally significant, so the suffix is
// coloured like present weather while the base layer keeps the category colour.
const CLOUD_CB_RE = /^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/{3})(CB|TCU)$/

// ── Token colouring ──────────────────────────────────────────────────────────
/**
 * Returns one or more coloured parts for a single raw token.
 * Most tokens yield a single part; a cloud group ending in CB/TCU is split so
 * the convective suffix can be highlighted independently.
 *
 * Priority: wind severity > present weather > CB/TCU cloud suffix > category.
 *
 * @returns {Array<{text:string, color:string}>}
 */
function colorizeToken(tok, catColor, windColor) {
  if (WIND_TOKEN_RE.test(tok) && windColor) return [{ text: tok, color: windColor }]
  if (WX_TOKEN_RE.test(tok))                return [{ text: tok, color: WX_COLOR  }]

  const cb = tok.match(CLOUD_CB_RE)
  if (cb) {
    return [
      { text: cb[1] + cb[2], color: catColor }, // e.g. "FEW017"
      { text: cb[3],         color: WX_COLOR },  // "CB" / "TCU"
    ]
  }

  return [{ text: tok, color: catColor }]
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

// Visibility thresholds are in METRES (ICAO standard).
// 9999 in a raw METAR means "10 km or more" → pass 10000.
function visCat(m) {
  if (m == null) return null
  if (m < 1500) return 'LIFR'
  if (m < 5000) return 'IFR'
  if (m < 8000) return 'MVFR'
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
  // Any TS compound (TSRA, TSSN, TSPL …) or any FZ → IFR floor
  // \bTS matches TS at the start of a word so RETSRA (recent) is correctly excluded
  if (/\bTS|\bFZ/.test(w)) return worst(cat, 'IFR')
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

  // aviationweather.gov returns visib in statute miles — convert to metres
  // so visCat() can use consistent ICAO metre thresholds.
  const visM = m.visib != null ? parseFloat(m.visib) * 1609.34 : null

  // CAVOK / unlimited sky codes → automatically VFR ceiling, apply wx floor
  if (/\b(CAVOK|CLR|SKC|NCD|NSC)\b/.test(raw)) {
    const base = visM != null ? (visCat(visM) ?? 'VFR') : 'VFR'
    return applyWxFloor(base, wx)
  }

  // Find ceiling = lowest BKN or OVC layer
  let ceiling = null
  if (Array.isArray(m.clouds)) {
    for (const c of m.clouds) {
      if ((c.cover === 'BKN' || c.cover === 'OVC') && c.base != null) {
        if (ceiling === null || c.base < ceiling) ceiling = c.base
      }
    }
  }

  const base = worst(visCat(visM), ceilCat(ceiling))
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
  return rawOb.split(/(\s+)/).flatMap(tok => colorizeToken(tok, catColor, windColor))
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

    // Tokenise: wind → windColor, wx/CB-TCU → WX_COLOR, rest → catColor
    const tokens = text.split(/(\s+)/).flatMap(tok => colorizeToken(tok, catColor, windColor))

    return { type, text, tokens, catColor, cat, isTemporal }
  })
}

// ── Internal TAF helpers ─────────────────────────────────────────────────────
function _categorizeTafText(text) {
  // Unlimited sky codes → VFR base
  if (/\b(CAVOK|SKC|NCD|NSC)\b/.test(text)) {
    const visM = _parseTafVisM(text)
    const vc   = visM != null ? (visCat(visM) ?? 'VFR') : 'VFR'
    return applyWxFloor(vc, _parseTafWxStr(text))
  }

  const visM    = _parseTafVisM(text)
  const ceiling = _parseTafCeilFt(text)
  const base    = worst(visCat(visM), ceilCat(ceiling))
  const safeBase = base ?? 'VFR'  // default optimistic when both null (e.g. continuation line)

  return applyWxFloor(safeBase, _parseTafWxStr(text))
}

// Returns visibility in METRES.
// ICAO 4-digit values are already in metres; US SM values are converted.
function _parseTafVisM(text) {
  // US format: "5SM", "1/2SM", "1 1/2SM" — convert SM → metres
  const smMatch = text.match(/\b(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*SM\b/)
  if (smMatch) {
    const parts = smMatch[1].trim().split(/\s+/)
    let valSm = 0
    for (const p of parts) {
      if (p.includes('/')) {
        const [n, d] = p.split('/')
        valSm += parseFloat(n) / parseFloat(d)
      } else {
        valSm += parseFloat(p)
      }
    }
    return valSm * 1609.34
  }
  // ICAO metric: 4-digit metres (0400–9999).
  //   (?<![A-Z\/])  — not preceded by a letter or '/' (excludes cloud bases, RHS of a validity period)
  //   (?!\/)        — not followed by '/' (excludes the LHS of a validity period like 1212/1318)
  //   (?!\s*FT)     — not a height value in feet
  const mMatch = text.match(/(?<![A-Z\/])(\b(?:0[4-9]\d{2}|[1-8]\d{3}|9999)\b)(?!\/)(?!\s*FT)/)
  if (mMatch) {
    const v = parseInt(mMatch[1])
    if (v === 9999) return 10000  // "10 km or more"
    if (v >= 400 && v <= 9998) return v  // already metres
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
