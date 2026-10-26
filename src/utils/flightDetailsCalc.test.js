import { describe, it, expect } from 'vitest'
import { pctOfLimit, weightLevel, fuelParts, fmtWc } from './flightDetailsCalc'

describe('pctOfLimit', () => {
  it('rounds to one decimal', () => {
    expect(pctOfLimit(60700, 61000)).toBe(99.5)
    expect(pctOfLimit(64434, 69308)).toBe(93)
  })
  it('is null without a usable limit', () => {
    expect(pctOfLimit(1000, null)).toBeNull()
    expect(pctOfLimit(1000, 0)).toBeNull()
  })
})

describe('weightLevel', () => {
  it('is green up to 70, amber to 80, red above', () => {
    expect(weightLevel(70)).toBe('green')
    expect(weightLevel(70.1)).toBe('amber')
    expect(weightLevel(80)).toBe('amber')
    expect(weightLevel(80.1)).toBe('red')
    expect(weightLevel(120)).toBe('red')
  })
  it('has no level when the percentage is unknown', () => {
    expect(weightLevel(null)).toBeNull()
  })
})

describe('fuelParts', () => {
  const fuel = {
    trip: { kg: 100, min: 60 }, contingency: { kg: 5, min: 3 },
    alternate: { icao: 'UZFN', kg: 10, min: 6 }, finalReserve: { kg: 8, min: 30 },
    tankering: null, extra: null, taxi: { kg: 2, min: 10 },
  }
  it('lists the parts in bar order, skipping tankering and extra when absent', () => {
    expect(fuelParts(fuel).map(p => p.key)).toEqual(['trip', 'contingency', 'alternate', 'finalReserve', 'taxi'])
  })
  it('keeps tankering and extra between the reserve and the taxi when present', () => {
    const keys = fuelParts({ ...fuel, tankering: { kg: 4, min: 2 }, extra: { kg: 1, min: 1 } }).map(p => p.key)
    expect(keys).toEqual(['trip', 'contingency', 'alternate', 'finalReserve', 'tankering', 'extra', 'taxi'])
  })
  it('names the alternate after its airport', () => {
    expect(fuelParts(fuel)[2].label).toBe('Alternate UZFN')
  })
})

describe('fmtWc', () => {
  it('signs the wind component', () => {
    expect(fmtWc(29)).toBe('+29')
    expect(fmtWc(-26)).toBe('−26')
    expect(fmtWc(0)).toBe('+0')
    expect(fmtWc(null)).toBeNull()
  })
})
