// Pure translation layer for the Traffic tab's flight-status lookup — turns
// AeroDataBox's raw response into the shape TrafficViewer renders, plus the
// display formatters it and the Schedules tab use. fmtTrack is also used by
// METARTAFCalculator for wind heading display.

export function fmtTrack(deg) { return `${String(Math.round(deg)).padStart(3, '0')}°` }
// flight_status times are split "HH:MM" + "DD Mon" strings with no year or
// timezone — this is the airport's local time, not Zulu, so it's shown as-is
// rather than relabelled with a "Z" suffix that would misrepresent it.
export function fmtLocalTime(time, date) {
  if (!time || /^-+:-+$/.test(time)) return null
  return date ? `${time} · ${date}` : time
}
export function fmtDelay(min) {
  if (typeof min !== 'number' || isNaN(min)) return null
  if (min === 0) return 'On time'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60), m = abs % 60
  const hhmm = h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m} min`
  return min > 0 ? `+${hhmm}` : `${hhmm} early`
}
// Extracts "HH:MM · DD Mon" from an AeroDataBox datetime string. The
// OpenAPI docs show ISO 8601 with a "T" separator (e.g.
// "2026-07-11T08:35:00+08:00"), but the real API uses a space instead
// (confirmed live: "2026-07-11 08:35+08:00") — accept either.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtIsoLocal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso || '')
  if (!m) return null
  const [, , mo, d, h, mi] = m
  return `${h}:${mi} · ${d} ${MONTHS[parseInt(mo, 10) - 1]}`
}
// AeroDataBox gives full ISO datetimes for both scheduled and revised times,
// so delay is a straight diff — no same-date guard needed like SkyLink's
// bare "HH:MM"/"DD Mon" (no year) strings required.
function isoDelayMinutes(scheduledIso, revisedIso) {
  if (!scheduledIso || !revisedIso) return null
  const sched = Date.parse(scheduledIso), revised = Date.parse(revisedIso)
  if (isNaN(sched) || isNaN(revised)) return null
  return Math.round((revised - sched) / 60_000)
}
const STATUS_KEYWORDS = [
  [/cancel/i, 'var(--cp-red)'],
  [/divert/i, 'var(--cp-purple)'],
  [/landed|arrived/i, 'var(--cp-dim)'],
  [/estimated|delay/i, 'var(--cp-orange)'],
  [/boarding|gate ?closed|departed|airborne|active|en ?route|approaching/i, 'var(--cp-acc)'],
  [/scheduled|on time|expected|check-?in/i, 'var(--cp-acc2)'],
]
export function statusColorFor(text) {
  const hit = STATUS_KEYWORDS.find(([re]) => re.test(text || ''))
  return hit ? hit[1] : 'var(--cp-dim)'
}

function fmtDistanceNm(gcd) {
  if (typeof gcd === 'number') return `${Math.round(gcd)} nm`
  if (typeof gcd?.nm === 'number') return `${Math.round(gcd.nm)} nm`
  if (typeof gcd?.km === 'number') return `${Math.round(gcd.km * 0.539957)} nm`
  return null
}
function fmtQuality(quality) {
  return Array.isArray(quality) && quality.length ? quality.join(', ') : null
}
function fmtAlt(ft) { return ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft).toLocaleString()} ft` }
// Returns the four live-position sub-values separately (not one joined
// string) so the card can lay them out as individual grid cells.
function fmtPositionParts(loc) {
  if (typeof loc?.lat !== 'number' || typeof loc?.lon !== 'number') return null
  return {
    latLon: `${loc.lat.toFixed(1)}, ${loc.lon.toFixed(1)}`,
    alt: typeof loc.altitude === 'number' ? fmtAlt(loc.altitude) : null,
    speed: typeof loc.speed === 'number' ? `${Math.round(loc.speed)}kt` : null,
    heading: typeof loc.heading === 'number' ? fmtTrack(loc.heading) : null,
  }
}

// Shape confirmed against AeroDataBox's /flights/number/{flight}/{date}
// response — used over SkyLink's flight_status endpoint because it takes an
// explicit date (SkyLink's has none, and was observed returning a stale
// record) and returns full ISO datetimes for every leg instead of bare
// "HH:MM"/"DD Mon" strings with no year.
//
// callSign/aircraft/checkInDesk/baggageBelt/runwayTime/predictedTime/quality/
// codeshareStatus/isCargo/greatCircleDistance/location/aircraft image are NOT
// yet confirmed against a live response (traffic.js has been burned by
// doc-vs-reality mismatches before — see the ADS-B note this file used to
// carry). They're coded from AeroDataBox's published OpenAPI schema and read
// defensively (optional chaining throughout), so a wrong field name just
// leaves that value null instead of breaking the lookup. Verify against a
// real response before relying on them.
export function normalizeFlightStatus(raw) {
  if (!raw) return null
  const statusText = raw.status || '—'
  const depCode = raw.departure?.airport?.iata || raw.departure?.airport?.icao || null
  const arrCode = raw.arrival?.airport?.iata || raw.arrival?.airport?.icao || null
  const codeshare = [raw.codeshareStatus, raw.isCargo ? 'Cargo' : null].filter(Boolean).join(' · ') || null
  const image = raw.aircraft?.image
  return {
    flight: raw.number || '—',
    callSign: raw.callSign || null,
    airline: raw.airline?.name || null,
    aircraft: [raw.aircraft?.model, raw.aircraft?.reg, raw.aircraft?.modeS ? `modeS ${raw.aircraft.modeS}` : null]
      .filter(Boolean).join(' · ') || null,
    photo: typeof image === 'string' ? image : (image?.url || null),
    route: (depCode && arrCode) ? `${depCode} → ${arrCode}` : null,
    depCode, arrCode,
    status: statusText.toUpperCase(),
    statusColor: statusColorFor(statusText),
    schedDep: fmtIsoLocal(raw.departure?.scheduledTime?.local),
    schedArr: fmtIsoLocal(raw.arrival?.scheduledTime?.local),
    estArr: fmtIsoLocal(raw.arrival?.revisedTime?.local),
    // Prefers the arrival leg's own delay since this tab is about arrival —
    // falls back to departure's delay only if arrival has no revised time
    // yet (e.g. still scheduled, no live update). Previously this preferred
    // departure unconditionally, which showed a departure-delay number next
    // to arrival-only times — looked contradictory (e.g. "17 min late" next
    // to an arrival estimate that was actually early).
    delayMinutes: isoDelayMinutes(raw.arrival?.scheduledTime?.utc, raw.arrival?.revisedTime?.utc)
      ?? isoDelayMinutes(raw.departure?.scheduledTime?.utc, raw.departure?.revisedTime?.utc),
    depTerminal: raw.departure?.terminal || null,
    depGate: raw.departure?.gate || null,
    arrTerminal: raw.arrival?.terminal || null,
    arrGate: raw.arrival?.gate || null,
    depCheckInDesk: raw.departure?.checkInDesk || null,
    arrBaggageBelt: raw.arrival?.baggageBelt || null,
    depRunwayTime: fmtIsoLocal(raw.departure?.runwayTime?.local),
    arrPredictedTime: fmtIsoLocal(raw.arrival?.predictedTime?.local),
    quality: fmtQuality(raw.arrival?.quality) || fmtQuality(raw.departure?.quality),
    codeshare,
    distance: fmtDistanceNm(raw.greatCircleDistance),
    position: fmtPositionParts(raw.location),
  }
}

// Cross-check source when AeroDataBox has no live position for a flight —
// SkyLink's own ADS-B feed (a different vendor/network) queried by callsign.
// Shape confirmed live for the /adsb/aircraft endpoint (see git history on
// this file): flat lat/lon, altitude in ft, ground_speed in kts, track in
// degrees, response wrapped in { aircraft: [...] }.
export function normalizeSkylinkPosition(raw) {
  const a = Array.isArray(raw?.aircraft) ? raw.aircraft[0] : null
  if (!a) return null
  return fmtPositionParts({ lat: a.latitude, lon: a.longitude, altitude: a.altitude, speed: a.ground_speed, heading: a.track })
}
