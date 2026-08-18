// Quick Turnaround Limit Weight — FCOM Performance Dispatch "Landing" pages
// (Flaps 40). A single OAT x pressure-altitude lookup gives the base limit
// weight, then two asymmetric rate-based adjustments apply — slope and wind
// each have a different rate for the favorable vs unfavorable direction, so
// the sign of the input picks which rate applies rather than a flat
// multiply. If the actual landing weight exceeds the adjusted limit, the
// manual requires either a minimum ground wait or a brake-temperature check
// before the next takeoff.

import { interp2D } from './gridInterpolation'

export function calcQuickTurnaroundLimitWeight({
  table, oat, pressureAltitude, slopePercent = 0, windComponent = 0, landingWeightKg,
}) {
  if (!table) return null
  const oatN = parseFloat(oat)
  const paN = parseFloat(pressureAltitude)
  const slopeN = parseFloat(slopePercent) || 0
  const windN = parseFloat(windComponent) || 0
  const landingWeightN = parseFloat(landingWeightKg)
  if ([oatN, paN, landingWeightN].some(n => isNaN(n))) return null

  const baseLimit1000kg = interp2D(oatN, paN, table.oat, table.pressureAltitude, table.data)
  if (baseLimit1000kg == null) {
    return { baseLimitKg: null, slopeAdjustmentKg: 0, windAdjustmentKg: 0, adjustedLimitKg: null, verdict: null }
  }

  const c = table.corrections
  const slopeAdjustmentKg = slopeN >= 0 ? slopeN * c.slopeUpRatePerPercent : slopeN * c.slopeDownRatePerPercent
  const windAdjustmentKg = windN >= 0
    ? (windN / 10) * c.windHeadRatePer10kt
    : (windN / 10) * c.windTailRatePer10kt

  const baseLimitKg = baseLimit1000kg * 1000
  const adjustedLimitKg = baseLimitKg + slopeAdjustmentKg + windAdjustmentKg

  const verdict = landingWeightN <= adjustedLimitKg ? 'ok' : 'exceeds'

  return { baseLimitKg, slopeAdjustmentKg, windAdjustmentKg, adjustedLimitKg, verdict }
}
