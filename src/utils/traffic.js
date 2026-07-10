// Pure translation layer for the Traffic tab — turns raw SkyLink API
// responses into the shape TrafficViewer renders, plus the display
// formatters it uses. Kept separate and tested because this exact step
// has already broken once: the ADS-B endpoint was first built against the
// SDK's own test fixtures, which didn't match the real API's field names
// (flat lat/lon, is_on_ground not on_ground, no origin/destination) — see
// the comment on normalizeAircraft below.

export function fmtAlt(ft) { return ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${ft.toLocaleString()} ft` }
export function fmtVs(vr) { return vr > 100 ? `↑ ${vr} fpm` : vr < -100 ? `↓ ${Math.abs(vr)} fpm` : 'level' }
export function fmtPinged(ts, nowMs) {
  if (!ts) return 'Not pinged yet'
  const s = Math.max(0, Math.round((nowMs - ts) / 1000))
  return s < 1 ? 'Just pinged' : `Pinged ${s}s ago`
}
export function fmtDistBrg(distNm, brgDeg) {
  if (distNm == null || brgDeg == null) return '—'
  return `${Math.round(distNm)} NM · ${String(Math.round(brgDeg)).padStart(3, '0')}°`
}
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

// Field names confirmed against a live response (the SDK's own test fixtures
// turned out not to match reality — flat lat/lon, is_on_ground not on_ground,
// no origin/destination on this endpoint, but a bonus `airline` name).
export function normalizeAircraft(raw) {
  return {
    icao24: raw.icao24 || '',
    callsign: (raw.callsign || raw.icao24 || '').trim(),
    registration: raw.registration || '—',
    aircraft_type: raw.aircraft_type || '—',
    lat: raw.latitude, lon: raw.longitude,
    altitude_ft: raw.altitude ?? 0,
    ground_speed_kts: raw.ground_speed ?? 0,
    track: raw.track ?? 0,
    vertical_rate: raw.vertical_rate ?? 0,
    squawk: raw.squawk || '----',
    on_ground: !!raw.is_on_ground,
    origin: null,
    destination: null,
    airline: raw.airline || null,
    pingedAt: null,
  }
}

function parseHHMM(t) {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
// SkyLink reports no explicit delay figure, only scheduled vs actual/estimated
// times per leg. Derive minutes late from those — but only when both times
// fall on the same date string; dates carry no year, so a rollover can't be
// resolved safely and it's better to show nothing than guess wrong.
function legDelayMinutes(leg) {
  if (!leg?.scheduled_time) return null
  const actualTime = leg.actual_time || leg.estimated_time
  const actualDate = leg.actual_time ? leg.actual_date : leg.estimated_date
  if (!actualTime) return null
  if (leg.scheduled_date && actualDate && leg.scheduled_date !== actualDate) return null
  const sched = parseHHMM(leg.scheduled_time)
  const actual = parseHHMM(actualTime)
  if (sched == null || actual == null) return null
  return actual - sched
}
// departure.airport / arrival.airport look like "SYD • Sydney" — use just the
// IATA code for a compact route badge (matches the old terse ICAO route).
function legCode(leg) {
  const code = leg?.airport?.split('•')[0]?.trim()
  return code || null
}
const STATUS_KEYWORDS = [
  [/cancel/i, 'var(--cp-red)'],
  [/divert/i, 'var(--cp-purple)'],
  [/landed|arrived/i, 'var(--cp-dim)'],
  [/estimated|delay/i, 'var(--cp-orange)'],
  [/boarding|departed|airborne|active/i, 'var(--cp-acc)'],
  [/scheduled|on time/i, 'var(--cp-acc2)'],
]
export function statusColorFor(text) {
  const hit = STATUS_KEYWORDS.find(([re]) => re.test(text || ''))
  return hit ? hit[1] : 'var(--cp-dim)'
}

// Shape confirmed against a live /flight_status/:flight_number response —
// status is free text (e.g. "Estimated 11:00"), airline is a single name,
// legs are nested departure/arrival objects with split date+time strings.
export function normalizeFlightStatus(raw) {
  if (!raw) return null
  const statusText = raw.status || '—'
  const depCode = legCode(raw.departure), arrCode = legCode(raw.arrival)
  return {
    flight: raw.flight_number || '—',
    airline: raw.airline || null,
    route: (depCode && arrCode) ? `${depCode} → ${arrCode}` : null,
    status: statusText.toUpperCase(),
    statusColor: statusColorFor(statusText),
    schedDep: fmtLocalTime(raw.departure?.scheduled_time, raw.departure?.scheduled_date),
    schedArr: fmtLocalTime(raw.arrival?.scheduled_time, raw.arrival?.scheduled_date),
    estArr: fmtLocalTime(raw.arrival?.estimated_time, raw.arrival?.estimated_date),
    delayMinutes: legDelayMinutes(raw.departure) ?? legDelayMinutes(raw.arrival),
  }
}
