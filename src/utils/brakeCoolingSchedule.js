// Recommended Brake Cooling Schedule — QRH Performance Inflight advisory data.
// Three chained lookups: Table 1 (weight/OAT/pressure altitude/brakes-on
// speed → reference brake energy) -> Table 2 (reference energy + event type
// + reverse thrust -> energy added by this stop) -> Table 3 (total event
// adjusted energy -> cooling zone + cooling time). Quick-turnaround chaining
// just adds a carried-over residual energy and a taxi distance before the
// Table 3 step — same function serves both single-event and chain use.
//
// A blank cell in the source tables (a combination the manual doesn't
// publish) or a reference/adjusted energy beyond the last published
// breakpoint comes back as null — never extrapolated past what Boeing
// published, since this is safety-relevant data.

import { interp1D, interp2D } from './gridInterpolation'

export function lookupReferenceEnergy(table1Bands, weight1000kg, oatC, altitudeKft, speedKias) {
  const band = table1Bands.find(b => altitudeKft >= b.altMin && altitudeKft <= b.altMax)
  if (!band) return null

  const grid = {}
  for (const w of band.weights) {
    grid[String(w)] = band.oats.map(o => {
      const cell = band.data[String(w)]?.[String(o)]
      if (!cell) return null
      return interp2D(speedKias, altitudeKft, band.speeds, band.altCols, cell)
    })
  }
  return interp2D(weight1000kg, oatC, band.weights, band.oats, grid)
}

export function lookupEventAdjustedEnergy(table2, referenceEnergy, event, reverseThrust) {
  if (referenceEnergy == null) return null
  const sub = reverseThrust ? table2.twoEngineReverse : table2.noReverse
  const row = event === 'rtoMaxMan' ? sub.rtoMaxMan : sub.landing[event]
  if (!row) return null
  return interp1D(referenceEnergy, sub.breakpoints, row)
}

export function lookupCoolingSchedule(table3, totalEnergy) {
  if (totalEnergy == null || isNaN(totalEnergy)) return null
  if (totalEnergy <= table3.floorEnergy) {
    return { zone: 'none', gearDownMinutes: 0, groundMinutes: 0, brakeTempIndication: null }
  }
  if (totalEnergy >= table3.fusePlugMin) {
    return { zone: 'fusePlugMelt', gearDownMinutes: null, groundMinutes: null, brakeTempIndication: null }
  }
  const [cautionMin] = table3.cautionRange
  if (totalEnergy >= cautionMin) {
    return { zone: 'caution', gearDownMinutes: null, groundMinutes: null, brakeTempIndication: null }
  }

  const bp = table3.breakpoints
  // The manual gives no curve in the narrow floor->first-point or
  // last-point->caution gaps, so hold the nearest published value there
  // rather than interpolate toward an unpublished number.
  const clamped = Math.min(Math.max(totalEnergy, bp[0]), bp[bp.length - 1])
  return {
    zone: 'noSpecialProcedure',
    gearDownMinutes: interp1D(clamped, bp, table3.gearDownMinutes),
    groundMinutes: interp1D(clamped, bp, table3.groundMinutes),
    brakeTempIndication: interp1D(clamped, bp, table3.brakeTempIndication),
  }
}

export function taxiEnergyAdded(taxi, distanceMiles, oatC) {
  const dist = parseFloat(distanceMiles) || 0
  if (dist <= 0) return 0
  if (taxi.highRatePerMile != null && (oatC < taxi.highRateOatBelow || oatC > taxi.highRateOatAbove)) {
    return dist * taxi.highRatePerMile
  }
  return dist * taxi.ratePerMile
}

export function calcBrakeCoolingSchedule({
  table1Bands, table2, table3, taxi,
  weightKg, oatC, altitudeFt, speedKias, windKt,
  event, reverseThrust,
  residualEnergy = 0, taxiDistanceMiles = 0,
}) {
  const weight = parseFloat(weightKg) / 1000
  const oat = parseFloat(oatC)
  const altitude = parseFloat(altitudeFt) / 1000
  const speed = parseFloat(speedKias)
  const wind = parseFloat(windKt) || 0
  if ([weight, oat, altitude, speed].some(n => isNaN(n))) return null

  const effectiveSpeed = speed - (wind >= 0 ? 0.5 : 1.5) * wind

  const referenceEnergy = lookupReferenceEnergy(table1Bands, weight, oat, altitude, effectiveSpeed)
  if (referenceEnergy == null) {
    return { referenceEnergy: null, addedEnergy: null, residual: null, taxiAdded: null, totalEnergy: null, schedule: null, effectiveSpeed, outOfRange: true }
  }

  const addedEnergy = lookupEventAdjustedEnergy(table2, referenceEnergy, event, reverseThrust)
  if (addedEnergy == null) {
    return { referenceEnergy, addedEnergy: null, residual: null, taxiAdded: null, totalEnergy: null, schedule: null, effectiveSpeed, outOfRange: true }
  }

  const residual = parseFloat(residualEnergy) || 0
  const taxiAdded = taxiEnergyAdded(taxi, taxiDistanceMiles, oat)
  const totalEnergy = residual + addedEnergy + taxiAdded
  const schedule = lookupCoolingSchedule(table3, totalEnergy)

  return { referenceEnergy, addedEnergy, residual, taxiAdded, totalEnergy, schedule, effectiveSpeed, outOfRange: false }
}
