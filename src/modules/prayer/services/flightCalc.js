import { qiblaBearing } from './qibla'
import { calculateLocal } from './adhanLocal'

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

// ── Great circle helpers ──────────────────────────────────────────────────────

/** Angular distance in radians between two lat/lng points */
function angularDistance(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * DEG, φ2 = lat2 * DEG
  const Δλ = (lng2 - lng1) * DEG
  return Math.acos(
    Math.min(1, Math.max(-1,
      Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)
    ))
  )
}

/** Great circle distance in nautical miles */
export function greatCircleNm(lat1, lng1, lat2, lng2) {
  return angularDistance(lat1, lng1, lat2, lng2) * RAD * 60
}

/**
 * Interpolate a point along the great circle from (lat1,lng1) to (lat2,lng2).
 * fraction: 0 = departure, 1 = destination, clamped to [0, 1].
 */
export function interpolateGreatCircle(lat1, lng1, lat2, lng2, fraction) {
  const f = Math.max(0, Math.min(1, fraction))
  if (f <= 0) return { lat: lat1, lng: lng1 }
  if (f >= 1) return { lat: lat2, lng: lng2 }

  const φ1 = lat1 * DEG, λ1 = lng1 * DEG
  const φ2 = lat2 * DEG, λ2 = lng2 * DEG

  const d = angularDistance(lat1, lng1, lat2, lng2)
  if (d < 1e-6) return { lat: lat1, lng: lng1 }

  const A = Math.sin((1 - f) * d) / Math.sin(d)
  const B = Math.sin(f * d)       / Math.sin(d)

  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2)
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2)
  const z = A * Math.sin(φ1)                 + B * Math.sin(φ2)

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD,
    lng: Math.atan2(y, x) * RAD,
  }
}

// ── Altitude correction ───────────────────────────────────────────────────────

/**
 * At altitude, the visible horizon is depressed, so the sun rises earlier
 * and sets later. Returns the correction in minutes.
 *
 * Formula: dip = arccos(R_earth / (R_earth + altitude_m))
 * Time correction = dip_degrees / 0.25 (sun moves ~0.25°/min)
 */
export function altitudeCorrectionMinutes(altitudeFt) {
  if (!altitudeFt || altitudeFt <= 0) return 0
  const altM = altitudeFt * 0.3048
  const R    = 6_371_000
  const dipRad = Math.acos(R / (R + altM))
  const dipDeg = dipRad * RAD
  return dipDeg / 0.25   // minutes
}

/**
 * Apply altitude correction to adhanLocal output.
 * Fajr / Sunrise shift earlier; Maghrib / Isha shift later.
 * Dhuhr and Asr are shadow-based — unchanged.
 */
export function applyAltitudeCorrection(times, altitudeFt) {
  const corrMin = altitudeCorrectionMinutes(altitudeFt)
  if (corrMin === 0) return times

  const shiftMs = corrMin * 60_000

  const shift = (date, sign) => {
    if (!(date instanceof Date)) return date
    return new Date(date.getTime() + sign * shiftMs)
  }

  const fmt = (date) => {
    if (!(date instanceof Date)) return ''
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  const imsakDate   = shift(times.imsakDate,    -1)
  const fajrDate    = shift(times.fajrDate,    -1)
  const sunriseDate = shift(times.sunriseDate,  -1)
  const maghribDate = shift(times.maghribDate,  +1)
  const ishaDate    = shift(times.ishaDate,     +1)

  return {
    ...times,
    imsakDate, fajrDate, sunriseDate, maghribDate, ishaDate,
    Imsak:   fmt(imsakDate),
    Fajr:    fmt(fajrDate),
    Sunrise: fmt(sunriseDate),
    Maghrib: fmt(maghribDate),
    Isha:    fmt(ishaDate),
  }
}

// ── Cabin-relative Qibla ──────────────────────────────────────────────────────

/**
 * Given the absolute Qibla bearing and the aircraft heading (both in degrees
 * from true north), returns how many degrees left or right of the aircraft
 * nose the Qibla direction is.
 */
export function cabinRelativeQibla(qibla, heading) {
  const rel = ((qibla - heading) % 360 + 360) % 360
  if (rel < 1)   return { angle: 0,           side: 'AHEAD'  }
  if (rel > 179 && rel < 181) return { angle: 180, side: 'BEHIND' }
  if (rel <= 180) return { angle: Math.round(rel),       side: 'RIGHT' }
  return              { angle: Math.round(360 - rel),   side: 'LEFT'  }
}

// ── In-flight prayer timeline ──────────────────────────────────────────────────

const PRAYER_KEYS = [
  { key: 'imsak',   name: 'Imsak'   },
  { key: 'fajr',    name: 'Fajr'    },
  { key: 'sunrise', name: 'Sunrise' },
  { key: 'dhuhr',   name: 'Dhuhr'   },
  { key: 'asr',     name: 'Asr'     },
  { key: 'maghrib', name: 'Maghrib' },
  { key: 'isha',    name: 'Isha'    },
]

// At elapsed hours `t`, returns how far off (in hours) the prayer's local
// clock time at position(t) is from the moment t itself represents — i.e.
// offset = 0 means the moving aircraft and the moving prayer threshold
// coincide right there. `dateArgMs` is held FIXED across a whole sweep (one
// per ~24h cycle) so only position(t) varies — otherwise a continuously
// advancing date arg would flip every prayer's underlying calendar day at
// once mid-sweep, since adhan.js returns a whole day's schedule keyed off
// the date passed in, producing a spurious synchronized ~24h jump that looks
// exactly like a real crossing for every prayer simultaneously.
function prayerOffsetAt(key, depPos, destPos, depInstantMs, totalHours, altitudeFt, settings, dateArgMs, t) {
  const pos = interpolateGreatCircle(depPos.lat, depPos.lng, destPos.lat, destPos.lng, t / totalHours)
  const base = calculateLocal(
    pos.lat, pos.lng, new Date(dateArgMs),
    settings?.calculationMethod ?? 'jakim',
    settings?.madhab ?? 'shafi',
    settings?.timeFormat ?? '24hr',
  )
  const corrected = applyAltitudeCorrection(base, altitudeFt)
  const xDate = corrected[`${key}Date`]
  if (!(xDate instanceof Date)) return null
  return { offset: (xDate.getTime() - depInstantMs) / 3_600_000 - t, pos, date: xDate }
}

// Dense sampling + bisection over one ~24h cycle's fixed reference day.
// With dateArgMs fixed, offset(t) varies smoothly (only via position drift),
// so at most one real crossing is found per cycle.
function findCrossingsForCycle(key, depPos, destPos, depInstantMs, totalHours, altitudeFt, settings, dateArgMs, stepHours) {
  const at = (t) => prayerOffsetAt(key, depPos, destPos, depInstantMs, totalHours, altitudeFt, settings, dateArgMs, t)
  const crossings = []
  let prev = at(0)
  for (let t = stepHours; t <= totalHours + 1e-9; t += stepHours) {
    const clampedT = Math.min(t, totalHours)
    const cur = at(clampedT)
    if (prev?.offset != null && cur?.offset != null && Math.sign(prev.offset) !== Math.sign(cur.offset)) {
      let lo = clampedT - stepHours, hi = clampedT
      const loSign = Math.sign(prev.offset)
      let mid = cur
      for (let i = 0; i < 24; i++) {
        const midT = (lo + hi) / 2
        mid = at(midT)
        if (mid?.offset == null) break
        if (Math.sign(mid.offset) === loSign) lo = midT
        else hi = midT
      }
      crossings.push({ key, elapsedHours: (lo + hi) / 2, position: mid.pos, date: mid.date })
    }
    prev = cur
  }
  return crossings
}

/**
 * Plots every Imsak/Fajr/Sunrise/Dhuhr/Asr/Maghrib/Isha that falls during the
 * flight, solved self-consistently against the aircraft's moving position
 * (dead reckoning) rather than frozen at a single snapshot in time. Sweeps
 * one fixed reference day per ~24h of flight so repeats on long-haul flights
 * are each found against their own calendar day, not a jumpy moving one.
 */
export function buildPrayerTimeline({ depPos, destPos, depInstantMs, totalHours, altitudeFt, settings, stepHours = 1 / 12 }) {
  const numCycles = Math.ceil(totalHours / 24) + 1
  const events = []
  for (const { key, name } of PRAYER_KEYS) {
    for (let c = 0; c < numCycles; c++) {
      const dateArgMs = depInstantMs + c * 86_400_000
      const found = findCrossingsForCycle(key, depPos, destPos, depInstantMs, totalHours, altitudeFt, settings, dateArgMs, stepHours)
      for (const f of found) events.push({ ...f, name })
    }
  }
  events.sort((a, b) => a.elapsedHours - b.elapsedHours)

  // Different cycles can occasionally converge on the same real occurrence;
  // collapse near-duplicates of the same prayer.
  const deduped = []
  for (const e of events) {
    const last = deduped[deduped.length - 1]
    if (last && last.key === e.key && Math.abs(last.elapsedHours - e.elapsedHours) < 0.05) continue
    deduped.push(e)
  }
  return deduped
}

// ── Main flight calculation ───────────────────────────────────────────────────

/**
 * Given flight inputs, returns estimated position, Qibla, cabin direction,
 * and the in-flight prayer timeline.
 *
 * @param {object} params
 * @param {{ lat, lng }} params.depPos
 * @param {{ lat, lng }} params.destPos
 * @param {number}       params.elapsedHours   — time since departure (h)
 * @param {number}       params.totalHours     — total estimated flight time (h)
 * @param {number}       params.altitudeFt     — cruise altitude in feet
 * @param {number|null}  params.headingDeg     — aircraft true heading (deg)
 * @param {object}       params.settings       — prayer settings (method, madhab, etc.)
 * @param {Date}         params.date           — current moment (default: now)
 */
export function calculateFlight({
  depPos, destPos,
  elapsedHours, totalHours,
  altitudeFt, headingDeg,
  settings,
  date = new Date(),
}) {
  const fraction = totalHours > 0 ? elapsedHours / totalHours : 0
  const position = interpolateGreatCircle(
    depPos.lat, depPos.lng, destPos.lat, destPos.lng, fraction
  )

  const totalNm    = greatCircleNm(depPos.lat, depPos.lng, destPos.lat, destPos.lng)
  const elapsedNm  = Math.round(totalNm * Math.min(fraction, 1))
  const remainNm   = Math.round(totalNm * Math.max(1 - fraction, 0))

  // Qibla from estimated position
  const bearing = qiblaBearing(position.lat, position.lng)

  // Cabin-relative direction
  const cabin = headingDeg != null
    ? cabinRelativeQibla(bearing, headingDeg)
    : null

  const depInstantMs = date.getTime() - elapsedHours * 3_600_000
  const timeline = buildPrayerTimeline({ depPos, destPos, depInstantMs, totalHours, altitudeFt, settings })

  const corrMin = Math.round(altitudeCorrectionMinutes(altitudeFt))

  return {
    position,
    bearing: Math.round(bearing),
    cabin,
    timeline,
    depInstantMs,
    elapsedHours: Math.min(elapsedHours, totalHours),
    totalHours,
    corrMin,
    totalNm: Math.round(totalNm),
    elapsedNm,
    remainNm,
    fraction: Math.min(fraction, 1),
  }
}
