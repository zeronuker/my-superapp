/**
 * NOTAM service — autorouter.aero API (free, no key, Eurocontrol EAD data)
 * Proxied through /api/notam to avoid CORS.
 * Docs: https://www.autorouter.aero/wiki/api/notams/
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
// autorouter uses Unix timestamps (seconds). endvalidity ≥ 2^31 means PERM.
const PERM_THRESHOLD = 2_000_000_000

function fmtUnixDate(sec) {
  if (!sec || sec >= PERM_THRESHOLD) return 'PERM'
  return new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

function computeValidity(raw) {
  const now      = Date.now()
  const startMs  = raw.startvalidity ? raw.startvalidity * 1000 : null
  const endSec   = raw.endvalidity
  const isPerm   = !endSec || endSec >= PERM_THRESHOLD
  const endMs    = isPerm ? null : endSec * 1000

  let status = 'UNKNOWN'
  if (startMs !== null) {
    if (startMs > now)              status = 'FUTURE'
    else if (!isPerm && endMs < now) status = 'EXPIRED'
    else                             status = 'ACTIVE'
  }

  return {
    status,
    start:    startMs ? new Date(startMs) : null,
    end:      endMs   ? new Date(endMs)   : null,
    startStr: fmtUnixDate(raw.startvalidity),
    endStr:   isPerm ? 'PERM' : fmtUnixDate(endSec),
  }
}

// ── Build readable NOTAM ID ───────────────────────────────────────────────────
function buildId(raw) {
  const series = raw.series || ''
  const num    = String(raw.number || '').padStart(4, '0')
  const yr     = String(raw.year || '').slice(-2)
  if (!num || num === '0000') return raw.id || 'UNKNOWN'
  return yr ? `${series}${num}/${yr}` : `${series}${num}`
}

// ── Build raw NOTAM text from item fields ─────────────────────────────────────
function buildRaw(raw) {
  return [
    raw.itema ? `A) ${raw.itema}` : '',
    raw.itemd ? `D) ${raw.itemd}` : '',
    raw.iteme ? `E) ${raw.iteme}` : '',
    raw.itemf ? `F) ${raw.itemf}` : '',
    raw.itemg ? `G) ${raw.itemg}` : '',
  ].filter(Boolean).join('\n') || JSON.stringify(raw)
}

// ── Raw-row parser (used by both live fetch and cache restore) ────────────────
const SORT_ORDER = { ACTIVE: 0, FUTURE: 1, EXPIRED: 2, UNKNOWN: 3 }

/**
 * Parse an array of `[{ icao, rows }]` raw API payloads into display-ready
 * NOTAM objects. Called on fetch AND when restoring from cache, so validity
 * status is always fresh (ACTIVE/FUTURE/EXPIRED recomputed at call time).
 */
export function parseRawNotams(rawPerIcao) {
  const allNotams = []
  const seen      = new Set()

  for (const { icao: source, rows } of rawPerIcao) {
    for (const raw of (rows ?? [])) {
      const id = buildId(raw)
      if (!id || seen.has(id)) continue
      seen.add(id)

      const qCode    = 'Q' + (raw.code23 || '') + (raw.code45 || '')
      const category = classifyQCode(qCode)
      const summary  = qCodeToSummary(qCode)
      const validity = computeValidity(raw)

      allNotams.push({
        id,
        source,
        icao:     raw.itema || raw.fir || source,
        category, summary, qCode, validity,
        startStr: validity.startStr,
        endStr:   validity.endStr,
        raw:      buildRaw(raw),
      })
    }
  }

  allNotams.sort((a, b) => SORT_ORDER[a.validity.status] - SORT_ORDER[b.validity.status])
  return allNotams
}

// ── Main fetch ────────────────────────────────────────────────────────────────
/**
 * Fetch NOTAMs for a list of ICAO location codes (airports or FIRs).
 * Returns { notams, rawPerIcao } where rawPerIcao is the compact raw payload
 * suitable for caching (re-parsed on restore so validity status stays fresh).
 */
export async function fetchNotams(icaoList, pageSize = 100) {
  if (!icaoList?.length) return { notams: [], rawPerIcao: [] }

  const results = await Promise.allSettled(
    icaoList.map(icao =>
      fetch(
        `/api/notam?icao=${icao.toUpperCase()}&pageSize=${pageSize}`,
        { signal: AbortSignal.timeout(15_000) }
      ).then(r => r.ok ? r.json() : Promise.reject(new Error(`${icao}: HTTP ${r.status}`)))
    )
  )

  // Surface error if every request failed
  const allFailed = results.every(r => r.status === 'rejected')
  if (allFailed) throw new Error(results[0]?.reason?.message ?? 'All NOTAM requests failed')

  const rawPerIcao = results.map((r, idx) => ({
    icao: String(icaoList[idx] || '').toUpperCase(),
    rows: r.status === 'fulfilled' ? (r.value?.rows ?? []) : [],
  }))

  return { notams: parseRawNotams(rawPerIcao), rawPerIcao }
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
