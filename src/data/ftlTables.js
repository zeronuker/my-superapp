/**
 * CAD 1901 (CAAM Malaysia) FTL Look-up Tables
 *
 * Values stored in MINUTES (integer).  null = data pending.
 *
 * Table A : 2+ crew, ACCLIMATISED,     sectors 1–8
 * Table B : 2+ crew, NOT ACCLIMATISED, sectors 1–8
 * Table C : single pilot,              sectors 1–4
 *
 * Time bands: 24 × 1-hour clock bands  0000–0059 … 2300–2359
 */

const BANDS = [
  '0000','0100','0200','0300','0400','0500',
  '0600','0700','0800','0900','1000','1100',
  '1200','1300','1400','1500','1600','1700',
  '1800','1900','2000','2100','2200','2300',
]

const n8 = () => Array(8).fill(null)
const n4 = () => Array(4).fill(null)

// ── Table A : 2+ crew, acclimatised ──────────────────────────────────────────
export const TABLE_A = BANDS.map(band => ({ band, v: n8() }))

// ── Table B : 2+ crew, not acclimatised ──────────────────────────────────────
export const TABLE_B = BANDS.map(band => ({ band, v: n8() }))

// ── Table C : single pilot ────────────────────────────────────────────────────
export const TABLE_C = BANDS.map(band => ({ band, v: n4() }))

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "14:37" → "1400" */
export function getTimeBand(hhmm) {
  const h = Math.max(0, Math.min(23, parseInt((hhmm || '').split(':')[0], 10) || 0))
  return String(h).padStart(2, '0') + '00'
}

/** "1400" → "1400–1459" */
export function getBandLabel(band) {
  return `${band}–${band.slice(0, 2)}59`
}

/**
 * Look up base max FDP in minutes.
 * Returns null if data not yet populated, undefined on bad inputs.
 */
export function lookupFDP(hhmm, sectors, crewType, acclimatised) {
  const band  = getTimeBand(hhmm)
  const table = crewType === 'single' ? TABLE_C
    : acclimatised ? TABLE_A : TABLE_B
  const row   = table.find(r => r.band === band)
  if (!row) return undefined
  const idx = Math.min(Math.max(1, sectors), row.v.length) - 1
  return row.v[idx]  // integer minutes, or null if pending
}
