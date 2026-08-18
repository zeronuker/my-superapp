import { describe, it, expect } from 'vitest'
import { calcQuickTurnaroundLimitWeight } from './quickTurnaroundLimitWeight'
import lookupTables from '../data/lookupTables.json'

const ngSteel = lookupTables['b737-800'].quickTurnaround.steel
const ngCarbon = lookupTables['b737-800'].quickTurnaround.carbon
const max = lookupTables['b737-8'].quickTurnaround

describe('calcQuickTurnaroundLimitWeight — NG Steel', () => {
  it('reads the base limit weight with no slope/wind adjustment', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngSteel, oat: 30, pressureAltitude: 0, landingWeightKg: 80000,
    })
    expect(r.baseLimitKg).toBe(84300)
    expect(r.adjustedLimitKg).toBe(84300)
    expect(r.verdict).toBe('ok')
  })

  it('flags a landing weight that exceeds the limit', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngSteel, oat: 30, pressureAltitude: 0, landingWeightKg: 85000,
    })
    expect(r.verdict).toBe('exceeds')
  })

  it('applies the uphill slope rate (700kg/%) for a positive slope', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngSteel, oat: 30, pressureAltitude: 0, slopePercent: 2, landingWeightKg: 80000,
    })
    expect(r.slopeAdjustmentKg).toBe(1400)
    expect(r.adjustedLimitKg).toBe(84300 + 1400)
  })

  it('applies the downhill slope rate (1150kg/%) for a negative slope', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngSteel, oat: 30, pressureAltitude: 0, slopePercent: -2, landingWeightKg: 80000,
    })
    expect(r.slopeAdjustmentKg).toBe(-2300)
    expect(r.adjustedLimitKg).toBe(84300 - 2300)
  })

  it('applies the headwind rate (1750kg/10kt) for a positive wind component', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngSteel, oat: 30, pressureAltitude: 0, windComponent: 20, landingWeightKg: 80000,
    })
    expect(r.windAdjustmentKg).toBe(3500)
  })

  it('applies the tailwind rate (7550kg/10kt) for a negative wind component', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngSteel, oat: 30, pressureAltitude: 0, windComponent: -20, landingWeightKg: 80000,
    })
    expect(r.windAdjustmentKg).toBe(-15100)
  })

  it('returns null for an uncertified OAT/pressure-altitude combination', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngSteel, oat: 54, pressureAltitude: 2000, landingWeightKg: 80000,
    })
    expect(r.baseLimitKg).toBeNull()
    expect(r.adjustedLimitKg).toBeNull()
    expect(r.verdict).toBeNull()
  })
})

describe('calcQuickTurnaroundLimitWeight — NG Carbon', () => {
  it('uses carbon-specific rates, distinct from steel', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngCarbon, oat: 0, pressureAltitude: 0, landingWeightKg: 80000,
    })
    expect(r.baseLimitKg).toBe(82200)
  })
  it('carbon slope-down rate differs from steel (still 1150, but head/tail wind rates differ)', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: ngCarbon, oat: 30, pressureAltitude: 0, windComponent: 20, landingWeightKg: 80000,
    })
    expect(r.windAdjustmentKg).toBe(3100) // 1550/10kt * 20
  })
})

describe('calcQuickTurnaroundLimitWeight — MAX (single table, no brake split)', () => {
  it('reads the extended pressure-altitude axis unique to MAX (14500ft)', () => {
    const r = calcQuickTurnaroundLimitWeight({
      table: max, oat: 25, pressureAltitude: 14500, landingWeightKg: 50000,
    })
    expect(r.baseLimitKg).toBe(58300)
    expect(r.verdict).toBe('ok')
  })
})

describe('calcQuickTurnaroundLimitWeight — edge cases', () => {
  it('returns null when table is missing', () => {
    expect(calcQuickTurnaroundLimitWeight({ table: null, oat: 30, pressureAltitude: 0, landingWeightKg: 80000 })).toBeNull()
  })
  it('returns null on non-numeric OAT', () => {
    expect(calcQuickTurnaroundLimitWeight({ table: ngSteel, oat: 'x', pressureAltitude: 0, landingWeightKg: 80000 })).toBeNull()
  })
})
