// Pure time helpers for the OFP identity header on the Briefing tab (no React/DOM).
// The OFP gives STD/STA/computed time as ISO UTC strings; local times come from the
// airport's IANA time zone (data/airports.json), so they work for any airport.

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const HOUR_MS = 3600e3
const DAY_MS = 24 * HOUR_MS

// An OFP loaded more than this from its STD (before or after) gets a warning.
export const WARN_MS = 6 * HOUR_MS

const pad = n => String(n).padStart(2, '0')

/** "2026-10-22T18:15:00Z" -> { time: '18:15Z', date: '22 OCT 2026' } */
export function utcParts(isoStr) {
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime())) return null
  return {
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`,
    date: `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  }
}

/** The same instant at an airport: { time: '02:15', offset: '+0800', date: '23 OCT 2026' }, or null for an unknown zone. */
export function localParts(isoStr, tz) {
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime()) || !tz) return null
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
    }).formatToParts(d).map(p => [p.type, p.value]))
    const off = /GMT([+-])(\d{2})(?::?(\d{2}))?/.exec(parts.timeZoneName)
    return {
      time: `${parts.hour}:${parts.minute}`,
      offset: off ? `${off[1]}${off[2]}${off[3] ?? '00'}` : '+0000',
      date: `${pad(+parts.day)} ${MON[+parts.month - 1]} ${parts.year}`,
    }
  } catch (_) { return null }
}

/** Block time as the airline uses it: scheduled arrival minus scheduled departure, in minutes. */
export function blockMinutes(stdIso, staIso) {
  const m = (Date.parse(staIso) - Date.parse(stdIso)) / 60000
  return Number.isFinite(m) ? Math.round(m) : null
}

/** 255 -> '04:15' */
export const fmtHm = min => (Number.isFinite(min) ? `${pad(Math.floor(min / 60))}:${pad(min % 60)}` : null)

// "3 days" / "11 hours": hours (rounded down) under 24 h, otherwise calendar days by UTC date.
function span(nowMs, thenMs) {
  const diff = Math.abs(nowMs - thenMs)
  if (diff < DAY_MS) {
    const h = Math.floor(diff / HOUR_MS)
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  const d = Math.max(1, Math.abs(Math.floor(nowMs / DAY_MS) - Math.floor(thenMs / DAY_MS)))
  return `${d} day${d === 1 ? '' : 's'}`
}

const shortDate = ms => {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()][0]}${MON[d.getUTCMonth()].slice(1).toLowerCase()}`
}

/**
 * Is this the right OFP for now? STD is the reference: none within 6 h either side;
 * 'past' (red) when STD is more than 6 h gone, 'future' (yellow) when it is more than 6 h away.
 * The past text counts from when the OFP was generated (its computed time).
 * @returns {{ level: 'past'|'future', text: string } | null}
 */
export function ofpWarning(nowMs, { std, computed }) {
  const stdMs = Date.parse(std)
  if (!Number.isFinite(stdMs)) return null
  if (nowMs > stdMs + WARN_MS) {
    const genMs = Date.parse(computed)
    return Number.isFinite(genMs)
      ? { level: 'past', text: `This OFP was generated ${span(nowMs, genMs)} ago (${shortDate(genMs)}).` }
      : { level: 'past', text: `This OFP’s STD was ${span(nowMs, stdMs)} ago (${shortDate(stdMs)}).` }
  }
  if (nowMs < stdMs - WARN_MS) {
    return { level: 'future', text: `This OFP’s STD is ${span(nowMs, stdMs)} ahead (${shortDate(stdMs)}).` }
  }
  return null
}
