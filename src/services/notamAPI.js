/**
 * NOTAM service — Notamify API (credit-based, Bearer key, global coverage).
 * Proxied through /api/notam to avoid CORS and keep the key server-side.
 * Docs: https://skymerse.gitbook.io/notamify-api
 */

import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'
import { icaoToFir, latlngToFir } from '../data/firLookup'

// ── Q-code subject → plain English ───────────────────────────────────────────
const Q_SUBJECT = {
  // Airspace
  QR:   'Airspace restriction',
  QRA:  'Aerodrome name',
  QRB:  'Restricted area',
  QRD:  'Danger area',
  QRP:  'Prohibited area',
  QRR:  'Restricted area activated',
  QRT:  'Temporary restricted area',
  QRW:  'Warning area',
  // Runway / Movement Area
  QM:   'Movement area',
  QMR:  'Runway',
  QMC:  'Runway closed',
  QML:  'Taxiway',
  QMT:  'Taxiway closed',
  QMS:  'Stand/apron',
  QMU:  'Unserviceable — movement area',
  QMX:  'Taxiway/apron closed',
  // Nav Aids
  QN:   'Navigation aid',
  QNA:  'ATIS',
  QNB:  'NDB',
  QND:  'VDF',
  QNL:  'Locator',
  QNM:  'VOR/DME',
  QNN:  'Radio navigation',
  QNO:  'DME',
  QNT:  'TACAN',
  QNU:  'VORTAC',
  QNV:  'VOR',
  QNX:  'ILS',
  QNY:  'MLS',
  QNZ:  'Approach aid',
  // Lighting
  QL:   'Lighting',
  QLA:  'Approach lighting',
  QLB:  'Aerodrome beacon',
  QLC:  'Runway centreline lighting',
  QLD:  'Landing direction indicator',
  QLE:  'Runway edge lighting',
  QLF:  'Sequenced flashing lights',
  QLG:  'Pilot-controlled lighting',
  QLH:  'High-intensity lighting',
  QLI:  'Runway TDZ lighting',
  QLP:  'PAPI',
  QLS:  'Stopway lighting',
  QLT:  'Threshold lighting',
  QLV:  'VASIS',
  QLW:  'Helipad lighting',
  QLL:  'Taxiway lighting',
  // Obstacles
  QO:   'Obstacle',
  QOB:  'Obstacle — crane/structure',
  QOL:  'Obstacle lighting',
  // Communication / ATC
  QS:   'ATC / Services',
  QSA:  'ATC advisory',
  QSS:  'ATC service suspended',
  QSR:  'ATC service resumed',
  QST:  'ATIS',
  // Procedures
  QP:   'Procedures',
  QPA:  'Arrival procedure',
  QPD:  'Departure procedure',
  QPI:  'Instrument approach procedure',
  // Aerodrome
  QA:   'Aerodrome',
  QAC:  'Aerodrome closed',
  QAO:  'Aerodrome operating hours',
  QAS:  'Aerodrome status',
  QAT:  'ATS at aerodrome',
  // Warning
  QW:   'Warning',
  QWA:  'Air display',
  QWB:  'Bird activity',
  QWE:  'Laser activity',
  QWF:  'Volcanic activity',
  QWG:  'Wildlife activity',
  QWH:  'Unmanned aircraft (drone)',
  QWJ:  'Rocket/missile activity',
  QWM:  'Military exercises',
  QWP:  'Parachute activity',
  QWU:  'Blasting activity',
  QWV:  'Parachute jumping',
  QWX:  'VIP movement',
  QWZ:  'SIGMET',
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
  if (q.startsWith('QR'))              return 'AIRSPACE'
  if (q.startsWith('QM'))              return 'AERODROME'
  if (q.startsWith('QO'))              return 'OBSTACLE'
  if (q.startsWith('QN'))              return 'NAVAID'
  if (q.startsWith('QW'))              return 'WARNING'
  if (q.startsWith('QL'))              return 'LIGHTING'
  if (q.startsWith('QP') || q.startsWith('QA')) return 'PROCEDURE'
  if (q.startsWith('QS'))              return 'AIRSPACE'
  return 'OTHER'
}

function qCodeToSummary(qCode) {
  if (!qCode) return 'Notice to air missions'
  const q = qCode.toUpperCase()
  for (let len = q.length; len >= 2; len--) {
    const sub = Q_SUBJECT[q.slice(0, len)]
    if (sub) return sub
  }
  return 'Notice to air missions'
}

// ── Validity helpers ──────────────────────────────────────────────────────────
// Notamify uses ISO-8601 timestamps plus an is_permanent boolean.
function fmtISO(ms) {
  if (ms == null || isNaN(ms)) return '—'
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

function computeValidity(raw) {
  const now     = Date.now()
  const startMs = raw.starts_at ? Date.parse(raw.starts_at) : null
  const isPerm  = !!raw.is_permanent || !raw.ends_at
  const endMs   = isPerm ? null : Date.parse(raw.ends_at)

  const hasStart = startMs != null && !isNaN(startMs)
  const hasEnd   = endMs   != null && !isNaN(endMs)

  let status = 'UNKNOWN'
  if (hasStart) {
    if (startMs > now)                  status = 'FUTURE'
    else if (!isPerm && hasEnd && endMs < now) status = 'EXPIRED'
    else                                status = 'ACTIVE'
  } else if (isPerm) {
    status = 'ACTIVE'
  }

  return {
    status,
    start:    hasStart ? new Date(startMs) : null,
    end:      hasEnd   ? new Date(endMs)   : null,
    startStr: hasStart ? fmtISO(startMs) : '—',
    endStr:   isPerm ? 'PERM' : fmtISO(endMs),
  }
}

// ── Q-code extraction ─────────────────────────────────────────────────────────
// Prefer the structured qcode field; fall back to the Q) line in the raw text.
function extractQCode(raw) {
  let q = (raw.qcode || '').toUpperCase().trim()
  if (q && !q.startsWith('Q')) q = 'Q' + q
  if (q.length >= 2) return q

  const m = (raw.icao_message || '').match(/Q\)\s*[A-Z]{4}\/(Q[A-Z]{2,4})/i)
  return m ? m[1].toUpperCase() : ''
}

// ── Parse one Notamify NOTAM object → app shape (pure, testable) ──────────────
/**
 * @param {object} raw  a Notamify notam object
 * @returns {object|null} normalised NOTAM, or null if unusable
 */
export function parseNotam(raw) {
  if (!raw) return null
  const id = raw.notam_number || raw.id
  if (!id) return null

  const qCode    = extractQCode(raw)
  const validity = computeValidity(raw)

  return {
    id:       String(id),
    icao:     raw.icao_code || raw.location || '',
    category: classifyQCode(qCode),
    summary:  qCodeToSummary(qCode),
    qCode,
    validity,
    startStr: validity.startStr,
    endStr:   validity.endStr,
    raw:      raw.icao_message || raw.message || JSON.stringify(raw),
  }
}

const STATUS_ORDER = { ACTIVE: 0, FUTURE: 1, EXPIRED: 2, UNKNOWN: 3 }

/**
 * Parse a Notamify API response ({ notams: [...] }) into sorted app NOTAMs,
 * deduplicating by id. Pure — accepts an array of response objects.
 */
export function parseNotamResponses(responses) {
  const out  = []
  const seen = new Set()

  for (const resp of responses) {
    for (const raw of resp?.notams ?? []) {
      const n = parseNotam(raw)
      if (!n || seen.has(n.id)) continue
      seen.add(n.id)
      out.push(n)
    }
  }

  out.sort((a, b) => STATUS_ORDER[a.validity.status] - STATUS_ORDER[b.validity.status])
  return out
}

// ── Main fetch ────────────────────────────────────────────────────────────────
/**
 * Fetch NOTAMs for a list of ICAO location codes (airports or FIRs).
 * Returns parsed NOTAM objects sorted: ACTIVE → FUTURE → EXPIRED.
 */
export async function fetchNotams(icaoList) {
  if (!icaoList?.length) return []

  const results = await Promise.allSettled(
    icaoList.map(icao =>
      fetch(
        `/api/notam?icao=${icao.toUpperCase()}`,
        { signal: AbortSignal.timeout(15_000) }
      ).then(r => r.ok ? r.json() : Promise.reject(new Error(`${icao}: HTTP ${r.status}`)))
    )
  )

  // Surface error if every request failed
  const allFailed = results.every(r => r.status === 'rejected')
  if (allFailed) throw new Error(results[0]?.reason?.message ?? 'All NOTAM requests failed')

  const responses = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)

  return parseNotamResponses(responses)
}

// ── FIR route detection ───────────────────────────────────────────────────────
/**
 * Sample 10 points along the great circle and return deduplicated FIR chips.
 */
export function detectRouteFirs(depPos, destPos) {
  const chips = []
  const seen  = new Set()

  const addFir = (entry) => {
    if (!entry || seen.has(entry.icao)) return
    seen.add(entry.icao)
    chips.push(entry)
  }

  for (let i = 0; i <= 10; i++) {
    const pos = interpolateGreatCircle(depPos.lat, depPos.lng, destPos.lat, destPos.lng, i / 10)
    addFir(latlngToFir(pos.lat, pos.lng))
  }

  return chips
}

/**
 * Build initial chips from DEP + ARR ICAO codes (airports + their home FIRs).
 */
export function buildInitialChips(depIcao, arrIcao) {
  const chips = []
  const seen  = new Set()

  const add = (icao, name, type) => {
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
