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
