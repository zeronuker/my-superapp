// Normalizes aviationweather.gov's international SIGMET feed — confirmed
// live to have genuine global coverage (real data for e.g. WBFC Kota
// Kinabalu FIR), unlike the domestic-only airsigmet/pirep/g-airmet products
// on the same API. One global fetch (the endpoint takes no location
// parameter), filtered client-side by FIR.

const HAZARD_LABEL = {
  TS: 'Thunderstorm', TURB: 'Turbulence', ICE: 'Icing', IC: 'Icing',
  VA: 'Volcanic ash', TC: 'Tropical cyclone', MTW: 'Mountain wave',
  SS: 'Sandstorm', DS: 'Duststorm', GR: 'Hail',
}
const HAZARD_COLOR = {
  TS: 'var(--cp-red)', TURB: 'var(--cp-orange)', ICE: 'var(--cp-acc2)', IC: 'var(--cp-acc2)',
  VA: 'var(--cp-purple)', TC: 'var(--cp-red)', MTW: 'var(--cp-orange)',
}
export function fmtHazard(hazard) { return HAZARD_LABEL[hazard] || hazard || 'Unknown hazard' }
export function hazardColor(hazard) { return HAZARD_COLOR[hazard] || 'var(--cp-dim)' }

export function fmtSigmetAlt(ft) {
  if (typeof ft !== 'number') return null
  return ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${ft.toLocaleString()} ft`
}
export function fmtSigmetTime(d) {
  if (!d) return null
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

export function normalizeSigmet(raw) {
  return {
    icaoId: raw.icaoId || null,
    firId: raw.firId || null,
    firName: raw.firName || null,
    hazard: raw.hazard || null,
    qualifier: raw.qualifier || null,
    base: typeof raw.base === 'number' ? raw.base : null,
    top: typeof raw.top === 'number' ? raw.top : null,
    validFrom: raw.validTimeFrom ? new Date(raw.validTimeFrom * 1000) : null,
    validTo: raw.validTimeTo ? new Date(raw.validTimeTo * 1000) : null,
    dir: raw.dir && raw.dir !== '-' ? raw.dir : null,
    spd: raw.spd && raw.spd !== '0' && raw.spd !== 'UNK' ? raw.spd : null,
    chng: raw.chng && raw.chng !== 'NC' ? raw.chng : null,
    raw: raw.rawSigmet || '',
  }
}

/** Filter a normalized SIGMET list down to the FIRs in `firIds` (a Set of uppercase codes). */
export function filterSigmetsByFir(sigmets, firIds) {
  if (!firIds?.size) return []
  return sigmets.filter(s => s.firId && firIds.has(s.firId.toUpperCase()))
}
