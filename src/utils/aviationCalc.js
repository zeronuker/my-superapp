/**
 * Aviation performance formulas — pressure altitude, density altitude, TAS.
 *
 * All altitudes in feet, temperatures in °C, speeds in knots, pressure in hPa.
 * Based on the ICAO Standard Atmosphere.
 */

// Near-MSL pressure lapse ≈ 27 ft per hPa (ISA).
export const FT_PER_HPA = 27
const ISA_MSL_TEMP_C = 15
const ISA_LAPSE_C_PER_1000FT = 1.98   // ≈ 2 °C per 1,000 ft

/**
 * Pressure altitude from field elevation and QNH.
 *   PA = elevation + (1013.25 − QNH) × 27
 * @returns {number|null} feet, rounded
 */
export function pressureAltitude(elevationFt, qnhHpa) {
  const e = parseFloat(elevationFt)
  const q = parseFloat(qnhHpa)
  if (isNaN(e) || isNaN(q)) return null
  return Math.round(e + (1013.25 - q) * FT_PER_HPA)
}

/** ISA temperature (°C) at a given pressure altitude. */
export function isaTempC(pressureAltFt) {
  const pa = parseFloat(pressureAltFt)
  if (isNaN(pa)) return null
  return ISA_MSL_TEMP_C - ISA_LAPSE_C_PER_1000FT * (pa / 1000)
}

/** ISA deviation (°C): how much warmer (+) or colder (−) than standard. */
export function isaDeviation(pressureAltFt, oatC) {
  const isa = isaTempC(pressureAltFt)
  const t = parseFloat(oatC)
  if (isa === null || isNaN(t)) return null
  return Math.round((t - isa) * 10) / 10
}

/**
 * Density altitude.
 *   DA = PA + 118.8 × (OAT − ISA_temp)
 * @returns {number|null} feet, rounded
 */
export function densityAltitude(pressureAltFt, oatC) {
  const pa = parseFloat(pressureAltFt)
  const t = parseFloat(oatC)
  const isa = isaTempC(pa)
  if (isNaN(pa) || isNaN(t) || isa === null) return null
  return Math.round(pa + 118.8 * (t - isa))
}

/**
 * ISA density ratio σ = ρ/ρ₀ at a standard-atmosphere altitude.
 *   σ = (1 − 6.8756e-6 × h)^4.2561      (h in feet)
 */
export function densityRatio(altFt) {
  const h = parseFloat(altFt)
  if (isNaN(h)) return null
  return Math.pow(1 - 6.8756e-6 * h, 4.2561)
}

/**
 * True airspeed from calibrated airspeed using density altitude.
 *   TAS = CAS / √σ      where σ is the density ratio at the density altitude
 *
 * (Ignores CAS↔EAS compressibility — accurate for typical GA/jet cruise.)
 * @returns {number|null} knots, rounded
 */
export function tasFromCas(casKt, densityAltFt) {
  const cas = parseFloat(casKt)
  const sigma = densityRatio(densityAltFt)
  if (isNaN(cas) || sigma === null || sigma <= 0) return null
  return Math.round(cas / Math.sqrt(sigma))
}
