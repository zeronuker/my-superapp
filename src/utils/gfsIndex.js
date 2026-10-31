// Finding one wind message inside NOAA's GFS forecast files on AWS (public, keyless, open to browsers).
// Each run ("cycle") is published every 6 hours as a GRIB2 file plus a small text index (.idx) that lists
// every message and where it starts, so one wind field can be fetched with a byte range (~52 KB) instead
// of the whole ~43 MB file. The 1° files have a forecast every 3 hours (f000, f003, ... f384).

const BASE = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com'
const HOUR = 3600000
const PUBLISH_LAG_H = 3.5            // a run starts appearing about this long after its nominal hour
const CYCLES_TRIED = 4               // newest first; an older one when the newest is not up yet

// Flight levels and the standard pressure level GFS publishes closest to each.
export const WIND_LEVELS = [
  { fl: 100, hpa: 700 },
  { fl: 180, hpa: 500 },
  { fl: 240, hpa: 400 },
  { fl: 300, hpa: 300 },
  { fl: 340, hpa: 250 },
  { fl: 390, hpa: 200 },
]
export const DEFAULT_WIND_LEVEL = 340

const two = n => String(n).padStart(2, '0')

// Runs that should exist by `nowMs`, newest first: { date: 'YYYYMMDD', hour, runMs }.
export function cycleCandidates(nowMs, count = CYCLES_TRIED) {
  const first = Math.floor((nowMs - PUBLISH_LAG_H * HOUR) / (6 * HOUR)) * 6 * HOUR
  return Array.from({ length: count }, (_, i) => {
    const runMs = first - i * 6 * HOUR
    const d = new Date(runMs)
    return { date: `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}`, hour: d.getUTCHours(), runMs }
  })
}

// The published forecast hour (a multiple of 3, 0 to 384) closest to `validMs`.
export function forecastStep(runMs, validMs) {
  const hours = (validMs - runMs) / HOUR
  return Math.max(0, Math.min(384, Math.round(hours / 3) * 3))
}

export function gfsFileUrl(cycle, step) {
  const hh = two(cycle.hour)
  return `${BASE}/gfs.${cycle.date}/${hh}/atmos/gfs.t${hh}z.pgrb2.1p00.f${String(step).padStart(3, '0')}`
}
export const gfsIndexUrl = (cycle, step) => `${gfsFileUrl(cycle, step)}.idx`

// "2:16900980:d=2026103106:UGRD:200 mb:3 hour fcst:" lines → [{ offset, variable, level }] in file order.
export function parseGfsIndex(text) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    const p = line.split(':')
    if (p.length < 6 || !/^\d+$/.test(p[1]) || !p[3] || !p[4]) continue
    out.push({ offset: Number(p[1]), variable: p[3], level: p[4] })
  }
  if (!out.length) throw new Error('malformed GFS index')
  return out
}

// Byte range of one message: from its offset to one byte before the next message. null when absent
// (or when it is the last one, whose end the index does not give).
export function messageRange(messages, variable, level) {
  const i = messages.findIndex(m => m.variable === variable && m.level === level)
  if (i < 0 || i + 1 >= messages.length) return null
  return { start: messages[i].offset, end: messages[i + 1].offset - 1 }
}

export const pressureLevelName = hpa => `${hpa} mb`
