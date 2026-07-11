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

// Extracts "HH:MM · DD Mon" from an ISO datetime string (e.g.
// "2026-07-11T08:35:00+08:00") regardless of trailing offset/Z — the
// date/time components are always in this position.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtIsoLocal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '')
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

// Shape confirmed against AeroDataBox's /flights/number/{flight}/{date}
// response — used over SkyLink's flight_status endpoint because it takes an
// explicit date (SkyLink's has none, and was observed returning a stale
// record) and returns full ISO datetimes for every leg instead of bare
// "HH:MM"/"DD Mon" strings with no year.
export function normalizeFlightStatus(raw) {
  if (!raw) return null
  const statusText = raw.status || '—'
  const depCode = raw.departure?.airport?.iata || raw.departure?.airport?.icao || null
  const arrCode = raw.arrival?.airport?.iata || raw.arrival?.airport?.icao || null
  return {
    flight: raw.number || '—',
    airline: raw.airline?.name || null,
    route: (depCode && arrCode) ? `${depCode} → ${arrCode}` : null,
    status: statusText.toUpperCase(),
    statusColor: statusColorFor(statusText),
    schedDep: fmtIsoLocal(raw.departure?.scheduledTime?.local),
    schedArr: fmtIsoLocal(raw.arrival?.scheduledTime?.local),
    estArr: fmtIsoLocal(raw.arrival?.revisedTime?.local),
    delayMinutes: isoDelayMinutes(raw.departure?.scheduledTime?.utc, raw.departure?.revisedTime?.utc)
      ?? isoDelayMinutes(raw.arrival?.scheduledTime?.utc, raw.arrival?.revisedTime?.utc),
    depTerminal: raw.departure?.terminal || null,
    depGate: raw.departure?.gate || null,
    arrTerminal: raw.arrival?.terminal || null,
    arrGate: raw.arrival?.gate || null,
  }
}
