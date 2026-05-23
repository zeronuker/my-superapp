/**
 * CAD 1901 (CAAM Malaysia) FTL Tables — ISS01 REV01
 *
 * All FDP values stored in MINUTES.
 *
 * TABLE A : 2+ crew, acclimatised      — 5 local-time bands × sectors 1–8+
 * TABLE B : 2+ crew, NOT acclimatised  — 2 preceding-rest bands × sectors 1–7+
 *           NOTE: Table B uses PRECEDING REST duration, NOT local time of start.
 * TABLE C : single pilot               — 5 local-time bands × sector groups ≤4/5/6/7/8+
 *
 * Source: decimal hours converted to minutes  (e.g. 12.25 h → 735 min)
 * NOTE: Table B sector 3 value "11.3" extracted as-is from PDF — verify
 *       against original document (may be 11.5 per 0.75-step pattern).
 */

const h = (decHours) => Math.round(decHours * 60)

// ── TABLE A : 2+ crew, acclimatised ──────────────────────────────────────────
// Columns: sectors 1, 2, 3, 4, 5, 6, 7, 8+
export const TABLE_A = [
  { id: 'b0', label: '0600–0759', v: [h(13), h(12.25), h(11.5),  h(10.75), h(10), h(9.5),  h(9),  h(9)  ] },
  { id: 'b1', label: '0800–1259', v: [h(14), h(13.25), h(12.5),  h(11.75), h(11), h(10.5), h(10), h(9.5)] },
  { id: 'b2', label: '1300–1759', v: [h(13), h(12.25), h(11.5),  h(10.75), h(10), h(9.5),  h(9),  h(9)  ] },
  { id: 'b3', label: '1800–2159', v: [h(12), h(11.25), h(10.5),  h(9.75),  h(9),  h(9),    h(9),  h(9)  ] },
  { id: 'b4', label: '2200–0559', v: [h(11), h(10.25), h(9.5),   h(9),     h(9),  h(9),    h(9),  h(9)  ] },
]

// ── TABLE B : 2+ crew, NOT acclimatised ──────────────────────────────────────
// Row selected by LENGTH OF PRECEDING REST (not local time of start).
// Columns: sectors 1, 2, 3, 4, 5, 6, 7+
export const TABLE_B = [
  { id: 'r0', label: 'Preceding rest ≤18h or ≥30h', v: [h(13), h(12.25), h(11.3), h(10.75), h(10), h(9.25), h(9)] },
  { id: 'r1', label: 'Preceding rest 18–30h',        v: [h(11.5), h(11), h(10.5), h(9.75),  h(9),  h(9),    h(9)] },
]

// ── TABLE C : single pilot ────────────────────────────────────────────────────
// Columns: ≤4 sectors, 5, 6, 7, 8+
export const TABLE_C = [
  { id: 'b0', label: '0600–0759', v: [h(10), h(9.25),  h(8.5),  h(8),    h(8)] },
  { id: 'b1', label: '0800–1259', v: [h(11), h(10.25), h(9.5),  h(8.75), h(8)] },
  { id: 'b2', label: '1300–1759', v: [h(10), h(9.25),  h(8.5),  h(8),    h(8)] },
  { id: 'b3', label: '1800–2159', v: [h(9),  h(8.25),  h(8),    h(8),    h(8)] },
  { id: 'b4', label: '2200–0559', v: [h(8),  h(8),     h(8),    h(8),    h(8)] },
]

// ── Band helpers ──────────────────────────────────────────────────────────────

/** Map local report time "HH:MM" → time band ID for Tables A and C */
export function getTimeBandAC(hhmm) {
  const hr = parseInt((hhmm || '').split(':')[0], 10) || 0
  if (hr >= 6  && hr < 8)  return 'b0'   // 0600–0759
  if (hr >= 8  && hr < 13) return 'b1'   // 0800–1259
  if (hr >= 13 && hr < 18) return 'b2'   // 1300–1759
  if (hr >= 18 && hr < 22) return 'b3'   // 1800–2159
  return 'b4'                             // 2200–0559  (hr >= 22 or hr < 6)
}

/** Map preceding rest in hours → Table B row ID */
export function tableBRowId(precedingRestH) {
  return (precedingRestH > 18 && precedingRestH < 30) ? 'r1' : 'r0'
}

// ── Column index helpers ──────────────────────────────────────────────────────

/** Table A column: sectors 1-8+  → index 0-7 */
function tableAColIdx(sectors) {
  return Math.min(Math.max(1, sectors), 8) - 1
}

/** Table B column: sectors 1-7+  → index 0-6 */
function tableBColIdx(sectors) {
  return Math.min(Math.max(1, sectors), 7) - 1
}

/** Table C column: ≤4 → 0, 5 → 1, 6 → 2, 7 → 3, 8+ → 4 */
function tableCColIdx(sectors) {
  if (sectors <= 4) return 0
  return Math.min(sectors - 4, 4)
}

// ── Main lookup ───────────────────────────────────────────────────────────────

/**
 * Returns base max FDP in minutes.
 * @param {string}  hhmm           Report time "HH:MM" (used for Tables A and C)
 * @param {number}  sectors        Effective sector count
 * @param {'2crew'|'single'} crewType
 * @param {boolean} acclimatised
 * @param {number}  precedingRestH Preceding rest in hours (required for Table B)
 * @returns {number|undefined}  Minutes, or undefined on lookup failure
 */
export function lookupFDP(hhmm, sectors, crewType, acclimatised, precedingRestH = 0) {
  if (crewType === 'single') {
    const row = TABLE_C.find(r => r.id === getTimeBandAC(hhmm))
    return row?.v[tableCColIdx(sectors)]
  }
  if (acclimatised) {
    const row = TABLE_A.find(r => r.id === getTimeBandAC(hhmm))
    return row?.v[tableAColIdx(sectors)]
  }
  // Not acclimatised — Table B (preceding rest based)
  const row = TABLE_B.find(r => r.id === tableBRowId(precedingRestH))
  return row?.v[tableBColIdx(sectors)]
}

/** Return the human-readable band label used for a given lookup */
export function getBandLabelForResult(hhmm, crewType, acclimatised, precedingRestH = 0) {
  if (crewType === 'single') {
    return TABLE_C.find(r => r.id === getTimeBandAC(hhmm))?.label ?? '–'
  }
  if (acclimatised) {
    return TABLE_A.find(r => r.id === getTimeBandAC(hhmm))?.label ?? '–'
  }
  return TABLE_B.find(r => r.id === tableBRowId(precedingRestH))?.label ?? '–'
}
