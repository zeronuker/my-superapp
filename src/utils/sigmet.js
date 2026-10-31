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
    // Affected area as the feed sends it: geom 'AREA' = [{lat,lon}...],
    // 'AREAS' = a list of those. Some SIGMETs have none (entire-FIR / empty).
    geom: raw.geom || null,
    coords: Array.isArray(raw.coords) && raw.coords.length ? raw.coords : null,
  }
}

/**
 * Turn validFrom/validTo back into Date objects. Anything that went through a
 * JSON round-trip (localStorage caches, Saved Briefings stored before they
 * moved to IndexedDB) has them as ISO strings, which breaks expiry checks and
 * time formatting. Safe to call on already-live Dates.
 */
export function reviveSigmets(sigmets) {
  return (sigmets || []).map(s => ({
    ...s,
    validFrom: s.validFrom ? new Date(s.validFrom) : null,
    validTo: s.validTo ? new Date(s.validTo) : null,
  }))
}

/** Filter a normalized SIGMET list down to the FIRs in `firIds` (a Set of uppercase codes). */
export function filterSigmetsByFir(sigmets, firIds) {
  if (!firIds?.size) return []
  return sigmets.filter(s => s.firId && firIds.has(s.firId.toUpperCase()))
}

// ── Map polygons ──────────────────────────────────────────────────────────────
// A SIGMET's area as closed [lng, lat] rings. The feed's rings aren't always
// closed and can cross the date line, so close them and keep longitudes
// continuous (a jump of >180° becomes ±360°) or the polygon smears across the map.
function toRing(points) {
  const ring = []
  let prev = null
  for (const p of points) {
    if (typeof p?.lat !== 'number' || typeof p?.lon !== 'number') continue
    let lng = p.lon
    if (prev !== null) {
      while (lng - prev > 180) lng -= 360
      while (lng - prev < -180) lng += 360
    }
    ring.push([lng, p.lat])
    prev = lng
  }
  if (ring.length < 3) return null
  const [fx, fy] = ring[0], [lx, ly] = ring[ring.length - 1]
  if (fx !== lx || fy !== ly) ring.push([fx, fy])
  return ring.length >= 4 ? ring : null
}

export function sigmetRings(s) {
  if (!s?.coords) return []
  const groups = Array.isArray(s.coords[0]) ? s.coords : [s.coords]
  return groups.map(toRing).filter(Boolean)
}

/**
 * GeoJSON polygons for every SIGMET that has an area and hasn't expired.
 * Feature properties carry what the map popup shows; `color` is added by the
 * map (CSS variables need resolving there). `num` is the SIGMET's place in the
 * list passed in (1-based, counted before expired ones are dropped), so the
 * number on the map matches the number on its card.
 */
export function sigmetsToGeoJSON(sigmets, now = Date.now()) {
  const features = []
  for (const [i, s] of (sigmets || []).entries()) {
    if (s.validTo && s.validTo.getTime() < now) continue
    const alt = [s.base, s.top].map(fmtSigmetAlt).filter(Boolean)
    const props = {
      num: i + 1,
      hazard: s.hazard || null,
      title: fmtHazard(s.hazard) + (s.qualifier ? ` · ${s.qualifier}` : ''),
      fir: s.firName || s.firId || '',
      alt: alt.length === 2 ? alt.join(' – ') : alt.length === 1 ? `to ${alt[0]}` : '',
      valid: s.validFrom || s.validTo ? `${fmtSigmetTime(s.validFrom) || ''} – ${fmtSigmetTime(s.validTo) || ''}` : '',
    }
    for (const ring of sigmetRings(s)) {
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } })
    }
  }
  return { type: 'FeatureCollection', features }
}

/**
 * One number label per zone, as Point features: at the zone's northernmost
 * corner, with the label drawn just above it, so it sits on the zone's edge and
 * not over its middle (where the route and airport dots usually are).
 */
export function sigmetLabelPoints(features) {
  return features.map(f => {
    const ring = f.geometry.coordinates[0]
    const top = ring.reduce((best, p) => (p[1] > best[1] ? p : best), ring[0])
    return { type: 'Feature', properties: { num: f.properties.num, color: f.properties.color }, geometry: { type: 'Point', coordinates: top } }
  })
}
