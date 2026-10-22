// Pure helpers for showing prayer times in the LOCATION's time zone, not the
// device's. `tz` is an IANA name ("Asia/Kuala_Lumpur"); undefined or invalid
// means the device's own zone (the old behaviour, used when the zone is unknown).

function parts(date, tz, opts) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', ...opts }).formatToParts(date)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hourCycle: 'h23', ...opts }).formatToParts(date)
  }
}
const num = (ps, type) => Number(ps.find(p => p.type === type).value)

// ms the zone is ahead of UTC at this instant
function offsetMs(instantMs, tz) {
  const ps = parts(new Date(instantMs), tz, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  const asUtc = Date.UTC(num(ps, 'year'), num(ps, 'month') - 1, num(ps, 'day'), num(ps, 'hour'), num(ps, 'minute'), num(ps, 'second'))
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

// The moment when the wall clock in `tz` reads `hhmm` on calendar day `ymd` ("YYYY-MM-DD").
export function zonedDate(ymd, hhmm, tz) {
  const [y, m, d] = ymd.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  if (!tz) return new Date(y, m - 1, d, h, mi)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const first = offsetMs(guess, tz)
  const second = offsetMs(guess - first, tz)   // differs from `first` only across a DST change
  return new Date(guess - second)
}

// Calendar day ("YYYY-MM-DD") of this moment in `tz`.
export function dayInZone(date, tz) {
  const ps = parts(date, tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${num(ps, 'year')}-${String(num(ps, 'month')).padStart(2, '0')}-${String(num(ps, 'day')).padStart(2, '0')}`
}

// "HH:MM" (24hr) or "h:MM AM/PM" (12hr).
export function fmtClock(h, m, timeFormat) {
  const mm = String(m).padStart(2, '0')
  if (timeFormat === '12hr') return `${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`
  return `${String(h).padStart(2, '0')}:${mm}`
}

// Clock reading of this moment in `tz`, formatted.
export function formatInZone(date, tz, timeFormat) {
  if (!date) return '--:--'
  const ps = parts(date, tz, { hour: 'numeric', minute: 'numeric' })
  return fmtClock(num(ps, 'hour'), num(ps, 'minute'), timeFormat)
}
