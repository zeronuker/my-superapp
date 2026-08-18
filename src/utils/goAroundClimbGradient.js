// Single-engine Go-Around Climb Gradient — 3-stage table chain from the FCOM
// Performance Dispatch "ENGINE INOP" pages (Flaps 15, Gear Up):
//   1. Reference gradient  = f(OAT, pressure altitude)
//   2. + Weight adjustment = f(landing weight, round(reference gradient))
//   3. + Speed adjustment  = f(speed above VREF40, round(weight-adjusted gradient))
//   4. + flat corrections (packs off / anti-ice / icing), from the table's own footnotes
//
// Unlike interpolateAltitude2D (built for the ISA+N band strings the
// altitude-capability tables use), every axis here is a plain number, so
// this uses the shared direction-agnostic 2D grid interpolator instead. A
// blank cell in the source table (a combination the manual doesn't publish)
// stays null all the way through rather than being guessed at.

import { interp2D } from './gridInterpolation'

// The weight/speed adjustment tables are keyed by the *rounded* gradient
// value from the previous stage — the manual has you round to the nearest
// whole-percent column, not interpolate across it.
function round0(x) { return x == null ? null : Math.round(x) }

export function calcGoAroundClimbGradient({
  table, oat, pressureAltitude, weightKg, speedOffset,
  bleedConfig = 'packsOn', antiIce = 'none', icingConditions = false,
}) {
  if (!table) return null
  const oatN = parseFloat(oat)
  const paN = parseFloat(pressureAltitude)
  const weightN = parseFloat(weightKg)
  const speedN = parseFloat(speedOffset)
  if ([oatN, paN, weightN, speedN].some(n => isNaN(n))) return null

  const ref = table.reference
  const referenceGradient = interp2D(oatN, paN, ref.oat, ref.pressureAltitude, ref.data)

  const wAdj = table.weightAdjustment
  const weight1000kg = weightN / 1000
  const weightAdjustment = referenceGradient == null ? null
    : interp2D(weight1000kg, round0(referenceGradient), wAdj.weight, wAdj.referenceBand, wAdj.data)
  const weightAdjustedGradient = (referenceGradient == null || weightAdjustment == null)
    ? null : referenceGradient + weightAdjustment

  const sAdj = table.speedAdjustment
  const speedAdjustment = weightAdjustedGradient == null ? null
    : interp2D(speedN, round0(weightAdjustedGradient), sAdj.speedOffset, sAdj.weightAdjustedBand, sAdj.data)
  const speedAdjustedGradient = (weightAdjustedGradient == null || speedAdjustment == null)
    ? null : weightAdjustedGradient + speedAdjustment

  const c = table.corrections
  const corrections = {
    packsOff: bleedConfig === 'packsOff' ? c.packsOff : 0,
    antiIce: antiIce === 'engine' ? c.engineAntiIce : antiIce === 'engineAndWing' ? c.engineAndWingAntiIce : 0,
    icing: icingConditions && (c.icingInclusive ? oatN <= c.icingThresholdC : oatN < c.icingThresholdC)
      ? c.icingBelowLandingTemp : 0,
  }
  corrections.total = corrections.packsOff + corrections.antiIce + corrections.icing

  const finalGradient = speedAdjustedGradient == null ? null : speedAdjustedGradient + corrections.total

  return {
    referenceGradient, weightAdjustment, weightAdjustedGradient,
    speedAdjustment, speedAdjustedGradient, corrections, finalGradient,
  }
}
