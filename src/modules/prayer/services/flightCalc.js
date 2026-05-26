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

  const fajrDate    = shift(times.fajrDate,    -1)
  const sunriseDate = shift(times.sunriseDate,  -1)
  const maghribDate = shift(times.maghribDate,  +1)
  const ishaDate    = shift(times.ishaDate,     +1)

  return {
    ...times,
    fajrDate, sunriseDate, maghribDate, ishaDate,
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

// ── Main flight calculation ───────────────────────────────────────────────────

/**
 * Given flight inputs, returns estimated position, Qibla, cabin direction,
 * and altitude-corrected prayer times.
 *
 * @param {object} params
 * @param {{ lat, lng }} params.depPos
 * @param {{ lat, lng }} params.destPos
 * @param {number}       params.elapsedHours   — time since departure (h)
 * @param {number}       params.totalHours     — total estimated flight time (h)
 * @param {number}       params.altitudeFt     — cruise altitude in feet
 * @param {number|null}  params.headingDeg     — aircraft true heading (deg)
 * @param {object}       params.settings       — prayer settings (method, madhab, etc.)
 * @param {Date}         params.date           — date of flight (default: today)
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

  // Prayer times at estimated position with altitude correction
  const baseTimes = calculateLocal(
    position.lat, position.lng,
    date,
    settings?.calculationMethod ?? 'jakim',
    settings?.madhab ?? 'shafi',
    settings?.timeFormat ?? '24hr',
  )
  const times = applyAltitudeCorrection(baseTimes, altitudeFt)

  const corrMin = Math.round(altitudeCorrectionMinutes(altitudeFt))

  return {
    position,
    bearing: Math.round(bearing),
    cabin,
    times,
    corrMin,
    totalNm: Math.round(totalNm),
    elapsedNm,
    remainNm,
    fraction: Math.min(fraction, 1),
  }
}
