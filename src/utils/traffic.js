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
export function fmtSpeed(kts) { return `${Math.round(kts)} kts` }
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
const WAKE_LABEL = { L: 'Light', M: 'Medium', H: 'Heavy', J: 'Super' }
export function fmtWakeCategory(code) {
  if (!code) return null
  return WAKE_LABEL[code] || code
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

// Field names confirmed against a live /aircraft/registration/:reg response
// (production test against 9M-MXB, and the API's own official example
// schema for G-STBC) — the response is wrapped in { query, found,
// aircraft: {...} }, not flat, which is why this card used to render
// entirely blank. No country/engines/military fields exist anywhere on this
// endpoint — confirmed against the official schema, not just one sample.
// Engine data comes from a separate Aircraft Performance call keyed by
// icao_type; operator IATA/country come from a separate Airlines search
// keyed by airline_code (both below).
export function normalizeAircraftLookup(raw) {
  const a = raw?.found ? raw.aircraft : null
  if (!a) return null
  return {
    registration: a.registration || null,
    icao24: a.icao24 || null,
    icao_type: a.icao_type || null,
    type_name: a.type_name || null,
    manufacturer: a.manufacturer || null,
    operator: a.owner_operator || null,
    operator_icao: a.airline_code || null,
    serial_number: a.serial_number || null,
    year_manufactured: a.year_built || null,
    photos: Array.isArray(a.photos) ? a.photos : [],
  }
}

// Airlines search returns an array — take the first match (an exact ICAO/IATA
// code query should only ever match one airline). Confirmed live for BAW →
// British Airways. `country` here is the airline's home country, not the
// aircraft's country of registration — kept distinct in the UI label.
export function normalizeAirline(raw) {
  const a = Array.isArray(raw) ? raw[0] : null
  if (!a) return null
  return {
    name: a.name || null,
    iata: a.iata || null,
    icao: a.icao || null,
    callsign: a.callsign || null,
    country: a.country || null,
    logo: a.logo || null,
  }
}

// Confirmed live for B77W. There is no engine *count* field anywhere in
// SkyLink's data (only engine_type/engine_code), so the old "2× Jet" style
// display is replaced with just the type + code.
export function normalizeAircraftPerformance(raw) {
  if (!raw?.icao_type) return null
  return {
    engineType: raw.engine_type || null,
    engineCode: raw.engine_code || null,
    wakeCategory: raw.wake_category || null,
    cruiseSpeedKt: typeof raw.cruise_speed_ktas === 'number' ? raw.cruise_speed_ktas : null,
    serviceCeilingFt: typeof raw.service_ceiling_ft === 'number' ? raw.service_ceiling_ft : null,
    maxRangeNm: typeof raw.max_range_nm === 'number' ? raw.max_range_nm : null,
    wingSpanM: typeof raw.wing_span_m === 'number' ? raw.wing_span_m : null,
    lengthM: typeof raw.length_m === 'number' ? raw.length_m : null,
    mtowT: typeof raw.mtow_t === 'number' ? raw.mtow_t : null,
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
    depTerminal: raw.departure?.terminal || null,
    depGate: raw.departure?.gate || null,
    arrTerminal: raw.arrival?.terminal || null,
    arrGate: raw.arrival?.gate || null,
  }
}
