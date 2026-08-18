import { describe, it, expect } from 'vitest'
import { calcGoAroundClimbGradient } from './goAroundClimbGradient'
import lookupTables from '../data/lookupTables.json'

const ng24 = lookupTables['b737-800'].variants['cfm56-7b24'].tables.goAroundClimbGradient
const ng26 = lookupTables['b737-800'].variants['cfm56-7b26'].tables.goAroundClimbGradient
const max25 = lookupTables['b737-8'].variants['leap-1b25'].tables.goAroundClimbGradient
const max27 = lookupTables['b737-8'].variants['leap-1b27'].tables.goAroundClimbGradient

describe('calcGoAroundClimbGradient — NG CFM56-7B24', () => {
  it('exact-match baseline: OAT 30/PA 0, weight 60000kg, VREF40+5 -> reference gradient unchanged', () => {
    const r = calcGoAroundClimbGradient({
      table: ng24, oat: 30, pressureAltitude: 0, weightKg: 60000, speedOffset: 5,
    })
    expect(r.referenceGradient).toBe(4.95)
    expect(r.weightAdjustment).toBe(0)
    expect(r.weightAdjustedGradient).toBe(4.95)
    expect(r.speedAdjustment).toBe(0)
    expect(r.finalGradient).toBe(4.95)
  })

  it('interpolates the reference table between two OAT rows', () => {
    const r = calcGoAroundClimbGradient({
      table: ng24, oat: 28, pressureAltitude: 0, weightKg: 60000, speedOffset: 5,
    })
    // row26[0]=4.98, row30[0]=4.95 -> lerp at 28
    expect(r.referenceGradient).toBeCloseTo(4.965, 4)
  })

  it('returns null for a blank/uncertified cell (OAT 54, PA 2000)', () => {
    const r = calcGoAroundClimbGradient({
      table: ng24, oat: 54, pressureAltitude: 2000, weightKg: 60000, speedOffset: 5,
    })
    expect(r.referenceGradient).toBeNull()
    expect(r.finalGradient).toBeNull()
  })

  it('returns null when weight is outside the published range', () => {
    const r = calcGoAroundClimbGradient({
      table: ng24, oat: 30, pressureAltitude: 0, weightKg: 85000, speedOffset: 5,
    })
    expect(r.weightAdjustment).toBeNull()
    expect(r.weightAdjustedGradient).toBeNull()
    expect(r.finalGradient).toBeNull()
  })

  it('applies weight adjustment away from the 60t baseline', () => {
    const r = calcGoAroundClimbGradient({
      table: ng24, oat: 30, pressureAltitude: 0, weightKg: 70000, speedOffset: 5,
    })
    // round(4.95) = 5 -> weight 70 col 5 = -2.17
    expect(r.weightAdjustment).toBe(-2.17)
    expect(r.weightAdjustedGradient).toBeCloseTo(4.95 - 2.17, 4)
  })

  it('applies speed adjustment away from VREF40+5', () => {
    const r = calcGoAroundClimbGradient({
      table: ng24, oat: 30, pressureAltitude: 0, weightKg: 60000, speedOffset: 20,
    })
    // weightAdjustedGradient = 4.95, round = 5 -> speed offset 20, col 5 = 0.41
    expect(r.speedAdjustment).toBe(0.41)
    expect(r.finalGradient).toBeCloseTo(4.95 + 0.41, 4)
  })

  it('applies flat corrections: packs off + anti-ice (OAT 30, above the icing threshold so icing does not apply)', () => {
    const base = calcGoAroundClimbGradient({
      table: ng24, oat: 30, pressureAltitude: 0, weightKg: 60000, speedOffset: 5,
    })
    const withCorrections = calcGoAroundClimbGradient({
      table: ng24, oat: 30, pressureAltitude: 0, weightKg: 60000, speedOffset: 5,
      bleedConfig: 'packsOff', antiIce: 'engineAndWing', icingConditions: true,
    })
    expect(withCorrections.corrections.icing).toBe(0)
    expect(withCorrections.corrections.total).toBeCloseTo(0.5 - 0.3, 4)
    expect(withCorrections.finalGradient).toBeCloseTo(base.finalGradient + (0.5 - 0.3), 4)
  })

  it('icing correction only applies strictly below the threshold for NG (not at exactly 10C)', () => {
    const at10 = calcGoAroundClimbGradient({
      table: ng24, oat: 10, pressureAltitude: 0, weightKg: 60000, speedOffset: 5, icingConditions: true,
    })
    const below10 = calcGoAroundClimbGradient({
      table: ng24, oat: 6, pressureAltitude: 0, weightKg: 60000, speedOffset: 5, icingConditions: true,
    })
    expect(at10.corrections.icing).toBe(0)
    expect(below10.corrections.icing).toBe(-1.0)
  })
})

describe('calcGoAroundClimbGradient — NG CFM56-7B26 (FAA/JAA identical)', () => {
  it('FAA and JAA share the same table data', () => {
    expect(ng26).toEqual(lookupTables['b737-800'].variants['cfm56-7b26'].tables.goAroundClimbGradient)
  })
  it('matches the published reference value at OAT 30/PA 0', () => {
    const r = calcGoAroundClimbGradient({ table: ng26, oat: 30, pressureAltitude: 0, weightKg: 60000, speedOffset: 5 })
    expect(r.referenceGradient).toBe(6.38)
  })
})

describe('calcGoAroundClimbGradient — MAX LEAP-1B25', () => {
  it('exact-match baseline at OAT 30/PA 0, weight 65000kg, VREF40+5', () => {
    const r = calcGoAroundClimbGradient({
      table: max25, oat: 30, pressureAltitude: 0, weightKg: 65000, speedOffset: 5,
    })
    expect(r.referenceGradient).toBe(5.08)
    expect(r.weightAdjustment).toBe(0)
    expect(r.finalGradient).toBe(5.08)
  })

  it('reads the extended pressure-altitude range (12000ft) unique to MAX', () => {
    const r = calcGoAroundClimbGradient({
      table: max25, oat: 10, pressureAltitude: 12000, weightKg: 65000, speedOffset: 5,
    })
    expect(r.referenceGradient).toBe(0.24)
  })

  it('icing correction applies inclusively at exactly 10C for MAX', () => {
    const r = calcGoAroundClimbGradient({
      table: max25, oat: 10, pressureAltitude: 0, weightKg: 65000, speedOffset: 5, icingConditions: true,
    })
    expect(r.corrections.icing).toBe(-1.2)
  })

  it('applies the MAX-specific correction values', () => {
    const r = calcGoAroundClimbGradient({
      table: max25, oat: 30, pressureAltitude: 0, weightKg: 65000, speedOffset: 5,
      bleedConfig: 'packsOff', antiIce: 'engine',
    })
    expect(r.corrections.packsOff).toBe(0.2)
    expect(r.corrections.antiIce).toBe(-0.3)
  })
})

describe('calcGoAroundClimbGradient — MAX LEAP-1B27', () => {
  it('has genuinely different reference values from LEAP-1B25', () => {
    const r27 = calcGoAroundClimbGradient({ table: max27, oat: 30, pressureAltitude: 0, weightKg: 65000, speedOffset: 5 })
    const r25 = calcGoAroundClimbGradient({ table: max25, oat: 30, pressureAltitude: 0, weightKg: 65000, speedOffset: 5 })
    expect(r27.referenceGradient).toBe(5.85)
    expect(r27.referenceGradient).not.toBe(r25.referenceGradient)
  })
})

describe('calcGoAroundClimbGradient — edge cases', () => {
  it('returns null when table is missing', () => {
    expect(calcGoAroundClimbGradient({ table: null, oat: 30, pressureAltitude: 0, weightKg: 60000, speedOffset: 5 })).toBeNull()
  })
  it('returns null on non-numeric input', () => {
    const r = calcGoAroundClimbGradient({ table: ng24, oat: 'x', pressureAltitude: 0, weightKg: 60000, speedOffset: 5 })
    expect(r).toBeNull()
  })
})
