// Pure translation layer for the Traffic tab's flight-status lookup — turns
// AeroDataBox's raw response into the shape TrafficViewer renders, plus the
// display formatters it uses. fmtTrack is also used by METARTAFCalculator
// for wind heading display.

export function fmtTrack(deg) { return `${String(Math.round(deg)).padStart(3, '0')}°` }
export function fmtDelay(min) {
  if (typeof min !== 'number' || isNaN(min)) return null
  if (min === 0) return 'On time'
  const abs = Math.abs(min)
  const h = Math.floor(abs / 60), m = abs % 60
  const hhmm = h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m} min`
  return min > 0 ? `+${hhmm}` : `${hhmm} early`
}
// Formats a raw UTC-offset suffix ("Z", "+0800", "+08:00") into "+08:00" —
// always shown next to a local time so it's never ambiguous which airport's
// clock a time belongs to (paired with the "Departure · KUL" / "Arrival ·
// BOM" section headers that say which airport).
function fmtOffset(raw) {
  if (!raw) return null
  if (raw === 'Z') return '+00:00'
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(raw)
  return m ? `${m[1]}${m[2]}:${m[3]}` : null
}
// Extracts "HH:MM ±HH:MM · DD Mon" from an AeroDataBox datetime string. The
// OpenAPI docs show ISO 8601 with a "T" separator and seconds (e.g.
// "2026-07-11T08:35:00+08:00"), but the real API uses a space and omits
// seconds instead (confirmed live: "2026-07-11 08:35+08:00") — accept either.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtIsoLocal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?/.exec(iso || '')
  if (!m) return null
  const [, , mo, d, h, mi, off] = m
  const offset = fmtOffset(off)
  return `${h}:${mi}${offset ? ` ${offset}` : ''} · ${d} ${MONTHS[parseInt(mo, 10) - 1]}`
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

// Derives a coarse status (Scheduled/Airborne/Landed) purely from UTC
// timestamps already trusted elsewhere in this file — a cross-check against
// AeroDataBox's own `status` field, which was observed reporting "Arrived"
// for a flight that FlightRadar24 showed still 3+ hours from landing (the
// timestamps in that same response were accurate; only the status word was
// stale). Compares absolute instants (UTC) only — never a local wall-clock
// string against `now`, which would silently break across timezones.
function deriveStatus(raw, nowMs) {
  const depConfirmedUtc = raw.departure?.runwayTime?.utc || raw.departure?.revisedTime?.utc || null
  const depTime = depConfirmedUtc || raw.departure?.scheduledTime?.utc || null
  if (!depTime) return null
  const depMs = Date.parse(depTime)
  if (isNaN(depMs)) return null
  if (nowMs < depMs) return 'Scheduled'

  const arrTime = raw.arrival?.revisedTime?.utc || raw.arrival?.predictedTime?.utc || raw.arrival?.scheduledTime?.utc || null
  if (arrTime) {
    const arrMs = Date.parse(arrTime)
    if (!isNaN(arrMs) && nowMs >= arrMs) return 'Landed'
  }
  // Only claim airborne once departure is actually confirmed (runway/revised
  // time), not just because the scheduled departure time has passed — a
  // flight can be delayed at the gate long past its scheduled departure.
  return depConfirmedUtc ? 'Airborne' : null
}

// Best-available UTC departure/arrival instants for a leg, used only for
// ranking registration-search results — not as confident as deriveStatus's
// own distinction between "confirmed" and "scheduled-only", since ranking
// just needs *a* time to measure distance from, not a status verdict.
// `depConfirmed` is tracked separately so "in progress" (below) can require
// an actual confirmed departure, not just a scheduled window that happens
// to contain `now` — a flight due to leave at the same moment "now" falls
// in isn't necessarily airborne yet.
function flightUtcWindow(raw) {
  const depConfirmedIso = raw.departure?.runwayTime?.utc || raw.departure?.revisedTime?.utc || null
  const depIso = depConfirmedIso || raw.departure?.scheduledTime?.utc || null
  const arrIso = raw.arrival?.revisedTime?.utc || raw.arrival?.predictedTime?.utc || raw.arrival?.scheduledTime?.utc || null
  const depMs = depIso ? Date.parse(depIso) : NaN
  const arrMs = arrIso ? Date.parse(arrIso) : NaN
  return { depMs: isNaN(depMs) ? null : depMs, arrMs: isNaN(arrMs) ? null : arrMs, depConfirmed: !!depConfirmedIso }
}
// Ranks raw flight-search results (as returned for a registration search,
// which can match several sectors flown by the same aircraft in a day) by
// relevance to `nowMs`: a leg with a *confirmed* departure that's currently
// between departure and arrival ranks first (it's the one actually in the
// air right now); otherwise whichever leg's departure or arrival is closest
// to now — soonest upcoming or most recently completed — ranks first.
// Returns the same raw objects, reordered, each tagged with `_rank`
// metadata the UI can use to decide what "this one's live" badge to show.
export function rankFlightCandidates(rawFlights, nowMs = Date.now()) {
  return rawFlights
    .map(raw => {
      const { depMs, arrMs, depConfirmed } = flightUtcWindow(raw)
      const withinWindow = depMs != null && arrMs != null && nowMs >= depMs && nowMs <= arrMs
      const inProgress = withinWindow && depConfirmed
      const distances = [depMs, arrMs].filter(t => t != null).map(t => Math.abs(nowMs - t))
      const distanceMs = distances.length ? Math.min(...distances) : Infinity
      return { raw, _rank: { inProgress, distanceMs } }
    })
    .sort((a, b) => {
      if (a._rank.inProgress !== b._rank.inProgress) return a._rank.inProgress ? -1 : 1
      return a._rank.distanceMs - b._rank.distanceMs
    })
}

const RAW_IMPLIES_COMPLETED = /landed|arrived/i
const RAW_IMPLIES_NOT_YET_DEPARTED = /scheduled|on time|expected|check-?in|boarding|gate ?closed/i
const RAW_IMPLIES_CANCEL_DIVERT = /cancel|divert/i
// Only overrides the provider's status text when it directly contradicts
// our own timestamp math (the exact failure pattern above) — otherwise
// trusts AeroDataBox's richer vocabulary (Boarding/GateClosed/Delayed/etc.),
// which our simple math has no way to derive, and never overrides an
// explicit cancellation/diversion, which no timestamp comparison could infer.
function reconcileStatus(rawStatusText, derived) {
  if (!rawStatusText || rawStatusText === '—') return derived || rawStatusText || '—'
  if (!derived) return rawStatusText
  if (RAW_IMPLIES_CANCEL_DIVERT.test(rawStatusText)) return rawStatusText
  if (RAW_IMPLIES_COMPLETED.test(rawStatusText) && derived !== 'Landed') return derived
  if (RAW_IMPLIES_NOT_YET_DEPARTED.test(rawStatusText) && derived === 'Landed') return derived
  return rawStatusText
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
//
// `nowMs` defaults to the real clock but is an explicit parameter so status
// derivation is deterministic and testable.
export function normalizeFlightStatus(raw, nowMs = Date.now()) {
  if (!raw) return null
  const rawStatusText = raw.status || '—'
  const statusText = reconcileStatus(rawStatusText, deriveStatus(raw, nowMs))
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
    // Actual departure once it's happened (wheels-off, or the revised time
    // as a fallback when the airport has no runway-time granularity).
    depActual: fmtIsoLocal(raw.departure?.runwayTime?.local) || fmtIsoLocal(raw.departure?.revisedTime?.local),
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
