import { describe, it, expect } from 'vitest'
import {
  lookupReferenceEnergy, lookupEventAdjustedEnergy, lookupCoolingSchedule,
  taxiEnergyAdded, calcBrakeCoolingSchedule,
} from './brakeCoolingSchedule'
import lookupTables from '../data/lookupTables.json'

const max = lookupTables['b737-8'].brakeCooling
const ngSteel = lookupTables['b737-800'].brakeCooling.steel
const ngCarbon = lookupTables['b737-800'].brakeCooling.carbon

describe('lookupReferenceEnergy — MAX Table 1', () => {
  it('reads an exact grid point', () => {
    expect(lookupReferenceEnergy(max.table1Bands, 90, 0, 0, 80)).toBe(16.7)
  })

  it('interpolates between two weight rows', () => {
    // weight 85 is midway between the 90 (16.7) and 80 (15.3) rows at OAT 0, sea level, 80 KIAS
    expect(lookupReferenceEnergy(max.table1Bands, 85, 0, 0, 80)).toBeCloseTo(16.0, 5)
  })

  it('returns null for a blank (unpublished) cell', () => {
    // weight 90 at 180 KIAS is off the published chart
    expect(lookupReferenceEnergy(max.table1Bands, 90, 0, 0, 180)).toBeNull()
  })

  it('agrees with Table 1(b) at the 10,000ft band boundary', () => {
    const fromBandA = lookupReferenceEnergy(max.table1Bands, 90, 0, 10, 80)
    const fromBandB = lookupReferenceEnergy(max.table1Bands, 90, 0, 10, 80)
    expect(fromBandA).toBe(21.6)
    expect(fromBandB).toBe(21.6)
  })

  it('returns null above the published altitude range', () => {
    expect(lookupReferenceEnergy(max.table1Bands, 90, 0, 20, 80)).toBeNull()
  })
})

describe('lookupReferenceEnergy — NG Table 1 (single altitude band)', () => {
  it('reads an exact grid point', () => {
    expect(lookupReferenceEnergy(ngSteel.table1Bands, 80, 0, 0, 80)).toBe(15.1)
  })

  it('returns null above 10,000ft — NG only publishes the sea-level band', () => {
    expect(lookupReferenceEnergy(ngSteel.table1Bands, 80, 0, 12, 80)).toBeNull()
  })
})

describe('lookupEventAdjustedEnergy', () => {
  it('reads an exact breakpoint for a landing event, no reverse', () => {
    expect(lookupEventAdjustedEnergy(max.table2, 20, 'maxMan', false)).toBe(16.2)
  })

  it('interpolates between breakpoints', () => {
    // maxMan row: 20 -> 16.2, 30 -> 25.2; at 25 that's the midpoint
    expect(lookupEventAdjustedEnergy(max.table2, 25, 'maxMan', false)).toBeCloseTo(20.7, 5)
  })

  it('RTO MAX MAN is a 1:1 pass-through, identical with or without reverse', () => {
    expect(lookupEventAdjustedEnergy(max.table2, 25, 'rtoMaxMan', false)).toBe(25)
    expect(lookupEventAdjustedEnergy(max.table2, 25, 'rtoMaxMan', true)).toBe(25)
  })

  it('reverse thrust reduces adjusted energy for a landing event', () => {
    const noReverse = lookupEventAdjustedEnergy(max.table2, 20, 'maxAuto', false)
    const withReverse = lookupEventAdjustedEnergy(max.table2, 20, 'maxAuto', true)
    expect(withReverse).toBeLessThan(noReverse)
  })

  it('returns null beyond the last published breakpoint', () => {
    expect(lookupEventAdjustedEnergy(max.table2, 999, 'maxMan', false)).toBeNull()
  })
})

describe('lookupCoolingSchedule — MAX Table 3', () => {
  it('reads an exact breakpoint', () => {
    const r = lookupCoolingSchedule(max.table3, 17)
    expect(r.zone).toBe('noSpecialProcedure')
    expect(r.gearDownMinutes).toBe(1.0)
    expect(r.groundMinutes).toBe(6.6)
    expect(r.brakeTempIndication).toBe(2.6)
  })

  it('is in the no-wait zone at or below the floor energy', () => {
    const r = lookupCoolingSchedule(max.table3, 16)
    expect(r.zone).toBe('none')
    expect(r.gearDownMinutes).toBe(0)
  })

  it('flags the caution zone', () => {
    expect(lookupCoolingSchedule(max.table3, 35).zone).toBe('caution')
  })

  it('flags the fuse plug melt zone', () => {
    expect(lookupCoolingSchedule(max.table3, 45).zone).toBe('fusePlugMelt')
  })
})

describe('taxiEnergyAdded', () => {
  it('MAX: applies the normal rate for a moderate OAT', () => {
    expect(taxiEnergyAdded(max.taxi, 3, 15)).toBe(6.0)
  })
  it('MAX: applies the high rate for OAT below -25C', () => {
    expect(taxiEnergyAdded(max.taxi, 3, -30)).toBe(9.0)
  })
  it('MAX: applies the high rate for OAT above 30C', () => {
    expect(taxiEnergyAdded(max.taxi, 3, 35)).toBe(9.0)
  })
  it('NG: flat rate regardless of OAT', () => {
    expect(taxiEnergyAdded(ngSteel.taxi, 3, 35)).toBe(3.0)
  })
  it('returns 0 for no taxi distance', () => {
    expect(taxiEnergyAdded(max.taxi, 0, 15)).toBe(0)
  })
})

describe('calcBrakeCoolingSchedule — single event', () => {
  it('runs the full chain for a straightforward landing', () => {
    const r = calcBrakeCoolingSchedule({
      ...max, weightKg: 90000, oatC: 0, altitudeFt: 0, speedKias: 80, windKt: 0,
      event: 'maxMan', reverseThrust: false,
    })
    expect(r.referenceEnergy).toBe(16.7)
    expect(r.addedEnergy).not.toBeNull()
    expect(r.totalEnergy).toBe(r.addedEnergy)
    expect(r.schedule).not.toBeNull()
    expect(r.outOfRange).toBe(false)
  })

  it('applies wind correction before the Table 1 lookup (tailwind adds 1.5x to speed)', () => {
    const noWind = calcBrakeCoolingSchedule({
      ...max, weightKg: 90000, oatC: 0, altitudeFt: 0, speedKias: 100, windKt: 0,
      event: 'maxMan', reverseThrust: false,
    })
    const tailwind = calcBrakeCoolingSchedule({
      ...max, weightKg: 90000, oatC: 0, altitudeFt: 0, speedKias: 100, windKt: -10,
      event: 'maxMan', reverseThrust: false,
    })
    expect(tailwind.effectiveSpeed).toBe(115) // 100 + 1.5*10
    expect(tailwind.referenceEnergy).toBeGreaterThan(noWind.referenceEnergy)
  })

  it('flags out-of-range when Table 1 has no published cell', () => {
    const r = calcBrakeCoolingSchedule({
      ...max, weightKg: 90000, oatC: 0, altitudeFt: 0, speedKias: 180, windKt: 0,
      event: 'maxMan', reverseThrust: false,
    })
    expect(r.outOfRange).toBe(true)
    expect(r.schedule).toBeNull()
  })
})

describe('calcBrakeCoolingSchedule — chain (quick turnaround)', () => {
  it('adds residual energy and taxi distance to this stop\'s added energy', () => {
    const base = calcBrakeCoolingSchedule({
      ...max, weightKg: 90000, oatC: 0, altitudeFt: 0, speedKias: 80, windKt: 0,
      event: 'maxMan', reverseThrust: false,
    })
    const chained = calcBrakeCoolingSchedule({
      ...max, weightKg: 90000, oatC: 0, altitudeFt: 0, speedKias: 80, windKt: 0,
      event: 'maxMan', reverseThrust: false,
      residualEnergy: 10, taxiDistanceMiles: 2,
    })
    expect(chained.residual).toBe(10)
    expect(chained.taxiAdded).toBe(4) // 2 miles * 2.0M/mile
    expect(chained.totalEnergy).toBeCloseTo(base.addedEnergy + 10 + 4, 5)
  })
})

describe('NG steel vs carbon — distinct Table 3 curves', () => {
  it('gives different cooling minutes for the same total energy', () => {
    const steel = lookupCoolingSchedule(ngSteel.table3, 20)
    const carbon = lookupCoolingSchedule(ngCarbon.table3, 20)
    expect(steel.gearDownMinutes).not.toBe(carbon.gearDownMinutes)
  })
})
