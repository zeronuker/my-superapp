// Pure translation layer for AeroDataBox's airport-runways response, plus
// the headwind/crosswind maths that pairs it with the METAR/TAF tab's
// already-parsed wind (m.wdir/m.wspd — see skylinkWeather.js/aviationweather
// shape both sources normalize to).

const SURFACE_LABEL = {
  Unknown: 'Unknown', Asphalt: 'Asphalt', Concrete: 'Concrete', Grass: 'Grass',
  Dirt: 'Dirt', Gravel: 'Gravel', DryLakebed: 'Dry Lakebed', Water: 'Water', Snow: 'Snow',
}
export function fmtSurface(code) { return SURFACE_LABEL[code] || code || 'Unknown' }

// Shape confirmed against AeroDataBox's /airports/{codeType}/{code}/runways
// response — each physical strip is two entries (one per end/name), each
// with its own reciprocal heading, threshold, and closed/lighting state.
export function normalizeRunways(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(Boolean).map(r => ({
    name: r.name || '—',
    headingDeg: typeof r.trueHdg === 'number' ? Math.round(r.trueHdg) : null,
    lengthM: typeof r.length?.meter === 'number' ? Math.round(r.length.meter) : null,
    surface: fmtSurface(r.surface),
    closed: !!r.isClosed,
    hasLighting: r.hasLighting ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

// Headwind (+ve = into the nose, -ve = tailwind) and crosswind (magnitude
// only, direction doesn't matter for a caution figure) components of a
// steady wind against a runway's true heading. Both inputs in degrees true.
export function windComponents(windDirDeg, windSpeedKt, runwayHeadingDeg) {
  if (typeof windDirDeg !== 'number' || typeof windSpeedKt !== 'number' || typeof runwayHeadingDeg !== 'number') return null
  const angle = (windDirDeg - runwayHeadingDeg) * Math.PI / 180
  return {
    headwind: Math.round(windSpeedKt * Math.cos(angle)),
    crosswind: Math.round(Math.abs(windSpeedKt * Math.sin(angle))),
  }
}
// Leads with whichever component is operationally more relevant: crosswind
// once it's the bigger of the two, otherwise head/tailwind.
export function fmtWindComponent(wc) {
  if (!wc) return '—'
  if (wc.crosswind > Math.abs(wc.headwind)) return `${wc.crosswind} kt XW`
  return wc.headwind >= 0 ? `+${wc.headwind} kt HW` : `${Math.abs(wc.headwind)} kt TW`
}

// Severity token for colour-coding a runway row — derived from the raw
// headwind/crosswind numbers (not the formatted label) so it can't drift
// out of sync with fmtWindComponent's display format.
export function windSeverity(wc, closed) {
  if (closed) return 'closed'
  if (!wc) return 'none'
  if (wc.crosswind > Math.abs(wc.headwind)) return 'crosswind'
  return wc.headwind < 0 ? 'tailwind' : 'headwind'
}
