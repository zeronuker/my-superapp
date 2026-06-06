/**
 * NOTAM service — FAA NOTAM Search API (free, no API key, international coverage)
 * Docs: https://notamapi.faa.gov/
 */

import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'
import { icaoToFir, latlngToFir } from '../data/firLookup'

const BASE = 'https://notamapi.faa.gov/api/v2'

// ── Q-code subject → plain English ───────────────────────────────────────────
const Q_SUBJECT = {
  // Airspace
  QR: 'Airspace restriction',
  QRA: 'Name of aerodrome',
  QRB: 'Restricted area',
  QRD: 'Danger area',
  QRE: 'Exercises',
  QRP: 'Prohibited area',
  QRR: 'Restricted area activated',
  QRT: 'Temporary restricted area',
  QRW: 'Warning area',
  // Runway / Movement Area
  QM: 'Movement area',
  QMR: 'Runway',
  QMC: 'Runway closed',
  QML: 'Taxiway',
  QMT: 'Taxiway closed',
  QMS: 'Stand/apron',
  QMU: 'Unserviceable',
  // Nav Aids
  QN: 'Navigation aid',
  QNA: 'ATIS',
  QNB: 'NDB',
  QND: 'VDF',
  QNL: 'Locator',
  QNM: 'VOR/DME',
  QNN: 'Radio navigation',
  QNO: 'DME',
  QNT: 'TACAN',
  QNU: 'VORTAC',
  QNV: 'VOR',
  QNX: 'ILS',
  QNY: 'MLS',
  QNZ: 'Approach',
  // Lighting
  QL: 'Lighting',
  QLA: 'Approach lighting',
  QLB: 'Aerodrome beacon',
  QLC: 'Runway centreline lighting',
  QLD: 'Landing direction indicator',
  QLE: 'Runway edge lighting',
  QLF: 'Sequenced flashing lights',
  QLG: 'Pilot-controlled lighting',
  QLH: 'High-intensity lighting',
  QLI: 'Runway TDZ lighting',
  QLP: 'PAPI',
  QLR: 'All RTG lighting',
  QLS: 'Stopway lighting',
  QLT: 'Threshold lighting',
  QLV: 'VASIS',
  QLW: 'Helipad lighting',
  QLL: 'Taxiway lighting',
  // Obstacles
  QO: 'Obstacle',
  QOB: 'Obstacle — crane/structure',
  QOL: 'Obstacle lighting',
  // Communication / ATC
  QS: 'ATC / Airspace',
  QSA: 'ATC advisory',
  QSC: 'ATC clearance',
  QSL: 'ATC surveillance',
  QSP: 'Rescue coordination',
  QSR: 'ATC service resumed',
  QSS: 'ATC service suspended',
  QST: 'ATIS',
  // Procedures
  QP: 'Procedures',
  QPA: 'Procedure — arrival',
  QPD: 'Procedure — departure',
  QPI: 'Instrument approach procedure',
  QPO: 'Obstacle departure procedure',
  // Aerodrome
  QA: 'Aerodrome',
  QAC: 'Aerodrome closed',
  QAG: 'Aerodrome — customs/immigration',
  QAH: 'Aerodrome elevation',
  QAL: 'Aerodrome layout',
  QAO: 'Aerodrome operating hours',
  QAP: 'Aerodrome — PPR required',
  QAR: 'Aerodrome rescue',
  QAS: 'Aerodrome status',
  QAT: 'Aerodrome ATS',
  // Warning
  QW: 'Warning',
  QWA: 'Air display',
  QWB: 'Bird activity',
  QWC: 'Jet blast hazard',
  QWE: 'Laser activity',
  QWF: 'Volcanic activity',
  QWG: 'Wildlife activity',
  QWH: 'Unmanned aircraft (drone)',
  QWJ: 'Rocket/missile activity',
  QWL: 'Laser beam activity',
  QWM: 'Military exercises',
  QWS: 'Snow removal',
  QWU: 'Underwater blasting',
  QWV: 'Parachute activity',
  QWX: 'VIP movement',
  QWY: 'Aircraft in distress',
  QWZ: 'SIGMET',
}

// ── NOTAM Category → colour + label ──────────────────────────────────────────
export const NOTAM_CATEGORIES = {
  AERODROME:  { label: 'Aerodrome',       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)'  },
  AIRSPACE:   { label: 'Airspace',        color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)'  },
  OBSTACLE:   { label: 'Obstacle',        color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
  NAVAID:     { label: 'Nav Aids',        color: '#eab308', bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.3)'   },
  WARNING:    { label: 'Warning/Hazard',  color: '#a855f7', bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)'  },
  LIGHTING:   { label: 'Lighting',        color: '#06b6d4', bg: 'rgba(6,182,212,0.1)',   border: 'rgba(6,182,212,0.3)'   },
  PROCEDURE:  { label: 'Procedures',      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)'   },
  OTHER:      { label: 'Other',           color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.3)' },
}

function classifyQCode(qCode) {
  if (!qCode) return 'OTHER'
  const q = qCode.toUpperCase()
  if (q.startsWith('QR'))            return 'AIRSPACE'
  if (q.startsWith('QM'))            return 'AERODROME'
  if (q.startsWith('QO'))            return 'OBSTACLE'
  if (q.startsWith('QN'))            return 'NAVAID'
  if (q.startsWith('QW'))            return 'WARNING'
  if (q.startsWith('QL'))            return 'LIGHTING'
  if (q.startsWith('QP') || q.startsWith('QA')) return 'PROCEDURE'
  if (q.startsWith('QS'))            return 'AIRSPACE'
  return 'OTHER'
}

// ── Q-line parser ─────────────────────────────────────────────────────────────
/**
 * Parse a NOTAM Q-line into structured fields.
 * Q) FIR/QCODE/TRAFFIC/PURPOSE/SCOPE/LOWER/UPPER/COORD
 */
function parseQLine(raw) {
  if (!raw) return null
  // Strip leading "Q)" if present
  const line = raw.replace(/^\s*Q\)\s*/i, '').trim()
  const parts = line.split('/')
  if (parts.length < 6) return null
  return {
    fir:     parts[0]?.trim(),
    qCode:   parts[1]?.trim(),
    traffic: parts[2]?.trim(),
    purpose: parts[3]?.trim(),
    scope:   parts[4]?.trim(),
    lower:   parts[5]?.trim(),
    upper:   parts[6]?.trim(),
    coord:   parts[7]?.trim(),
  }
}

function qCodeToSummary(qCode) {
  if (!qCode) return 'Notice to air missions'
  const q = qCode.toUpperCase()
  // Try exact match first, then progressively shorter prefixes
  for (let len = q.length; len >= 2; len--) {
    const sub = Q_SUBJECT[q.slice(0, len)]
    if (sub) return sub
  }
  return 'Notice to air missions'
}

// ── Date / validity helpers ───────────────────────────────────────────────────
function parseNotamDate(str) {
  // FAA API format: "2024-06-01T10:00:00.000Z" or "2406010900" (YYMMDDHHMM)
  if (!str) return null
  if (str.includes('T') || str.includes('-')) return new Date(str)
  // YYMMDDHHMM
  const yy = str.slice(0, 2)
  const mm = str.slice(2, 4)
  const dd = str.slice(4, 6)
  const hh = str.slice(6, 8)
  const mn = str.slice(8, 10)
  return new Date(`20${yy}-${mm}-${dd}T${hh}:${mn}:00Z`)
}

export function getValidity(notam) {
  const now = Date.now()
  const start = parseNotamDate(notam.startDate || notam.effectiveStart)
  const end   = parseNotamDate(notam.endDate   || notam.effectiveEnd)
  if (!start) return { status: 'UNKNOWN', start: null, end: null }
  if (start.getTime() > now)   return { status: 'FUTURE',  start, end }
  if (end && end.getTime() < now) return { status: 'EXPIRED', start, end }
  return { status: 'ACTIVE', start, end }
}

function fmtDate(d) {
  if (!d) return 'PERM'
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

// ── Main fetch ────────────────────────────────────────────────────────────────
/**
 * Fetch NOTAMs for a list of ICAO location codes (airports or FIRs).
 * Returns parsed NOTAM objects sorted: ACTIVE first, then FUTURE, then EXPIRED.
 */
export async function fetchNotams(icaoList, pageSize = 100) {
  if (!icaoList?.length) return []

  const results = await Promise.allSettled(
    icaoList.map(icao =>
      fetch(
        `${BASE}/notams?icaoLocation=${icao.toUpperCase()}&pageSize=${pageSize}`,
        { signal: AbortSignal.timeout(12_000) }
      ).then(r => r.ok ? r.json() : Promise.reject(new Error(`${icao}: HTTP ${r.status}`)))
    )
  )

  const allNotams = []
  const seen = new Set()

  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const items = r.value?.items ?? r.value?.notams ?? (Array.isArray(r.value) ? r.value : [])
    for (const raw of items) {
      const id = raw.notamID || raw.id || raw.number
      if (!id || seen.has(id)) continue
      seen.add(id)

      const qParsed  = parseQLine(raw.qLine || raw.q)
      const qCode    = qParsed?.qCode ?? ''
      const category = classifyQCode(qCode)
      const summary  = qCodeToSummary(qCode)
      const validity = getValidity(raw)

      allNotams.push({
        id,
        icao:     raw.icaoLocation || raw.location || '',
        category,
        summary,
        qCode,
        qParsed,
        validity,
        startStr: fmtDate(validity.start),
        endStr:   fmtDate(validity.end),
        raw:      raw.notamText || raw.text || raw.message || JSON.stringify(raw),
      })
    }
  }

  // Sort: ACTIVE → FUTURE → EXPIRED
  const order = { ACTIVE: 0, FUTURE: 1, EXPIRED: 2, UNKNOWN: 3 }
  allNotams.sort((a, b) => order[a.validity.status] - order[b.validity.status])

  return allNotams
}

// ── FIR route detection ───────────────────────────────────────────────────────
/**
 * Given departure + arrival airport coords, sample 10 points along the
 * great circle and return deduplicated FIR chips (icao + name).
 */
export function detectRouteFirs(depPos, destPos) {
  const chips = []
  const seen  = new Set()

  const addFir = (entry) => {
    if (!entry || seen.has(entry.icao)) return
    seen.add(entry.icao)
    chips.push(entry)
  }

  // Sample 11 evenly-spaced points (0%, 10%, ... 100%)
  for (let i = 0; i <= 10; i++) {
    const f   = i / 10
    const pos = interpolateGreatCircle(depPos.lat, depPos.lng, destPos.lat, destPos.lng, f)
    const fir = latlngToFir(pos.lat, pos.lng)
    if (fir) addFir(fir)
  }

  return chips
}

/**
 * Given dep + arr ICAO codes (strings), return chips for both airports
 * plus their FIRs.
 */
export function buildInitialChips(depIcao, arrIcao) {
  const chips = []
  const seen  = new Set()

  const add = (icao, name, type = 'fir') => {
    if (!icao || seen.has(icao)) return
    seen.add(icao)
    chips.push({ icao, name, type })
  }

  if (depIcao) {
    add(depIcao.toUpperCase(), `${depIcao.toUpperCase()} (departure)`, 'airport')
    const fir = icaoToFir(depIcao)
    if (fir) add(fir.icao, fir.name, 'fir')
  }
  if (arrIcao) {
    add(arrIcao.toUpperCase(), `${arrIcao.toUpperCase()} (arrival)`, 'airport')
    const fir = icaoToFir(arrIcao)
    if (fir) add(fir.icao, fir.name, 'fir')
  }

  return chips
}
