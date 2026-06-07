import { describe, it, expect } from 'vitest'
import {
  pressureAltitude,
  isaTempC,
  isaDeviation,
  densityAltitude,
  densityRatio,
  tasFromCas,
} from './aviationCalc'

describe('pressureAltitude', () => {
  it('equals elevation at standard QNH (1013.25)', () => {
    expect(pressureAltitude(1000, 1013.25)).toBe(1000)
  })
  it('low QNH raises pressure altitude (~27 ft/hPa)', () => {
    // 1003.25 hPa is 10 below standard → +270 ft
    expect(pressureAltitude(0, 1003.25)).toBe(270)
  })
  it('high QNH lowers pressure altitude', () => {
    expect(pressureAltitude(0, 1023.25)).toBe(-270)
  })
  it('returns null on bad input', () => {
    expect(pressureAltitude('x', 1013)).toBeNull()
  })
})

describe('isaTempC', () => {
  it('is 15 °C at sea level', () => {
    expect(isaTempC(0)).toBeCloseTo(15, 5)
  })
  it('drops ~1.98 °C per 1,000 ft', () => {
    expect(isaTempC(10000)).toBeCloseTo(15 - 19.8, 5)
  })
})

describe('isaDeviation', () => {
  it('zero when OAT matches ISA', () => {
    expect(isaDeviation(0, 15)).toBe(0)
  })
  it('positive when warmer than ISA', () => {
    expect(isaDeviation(0, 25)).toBe(10)
  })
  it('negative when colder than ISA', () => {
    expect(isaDeviation(10000, -25)).toBeCloseTo(-25 - (15 - 19.8), 1) // ≈ -20.2
  })
})

describe('densityAltitude', () => {
  it('equals pressure altitude at ISA temperature', () => {
    expect(densityAltitude(0, 15)).toBe(0)
  })
  it('rises above PA when hotter than ISA', () => {
    // sea level, OAT 30 (ISA+15) → DA ≈ 0 + 118.8*15 = 1782 ft
    expect(densityAltitude(0, 30)).toBe(1782)
  })
  it('falls below PA when colder than ISA', () => {
    expect(densityAltitude(0, 0)).toBe(Math.round(118.8 * (0 - 15)))
  })
  it('hot-and-high example (5000 ft PA, OAT 30 °C)', () => {
    // ISA at 5000 ft = 15 - 9.9 = 5.1 °C; dev = 24.9 → DA = 5000 + 118.8*24.9 ≈ 7958
    expect(densityAltitude(5000, 30)).toBe(7958)
  })
  it('returns null on bad input', () => {
    expect(densityAltitude(5000, 'x')).toBeNull()
  })
})

describe('densityRatio', () => {
  it('is 1 at sea level', () => {
    expect(densityRatio(0)).toBeCloseTo(1, 5)
  })
  it('decreases with altitude', () => {
    expect(densityRatio(10000)).toBeLessThan(densityRatio(0))
    expect(densityRatio(10000)).toBeCloseTo(0.7385, 3)
  })
})

describe('tasFromCas', () => {
  it('TAS equals CAS at sea level density altitude', () => {
    expect(tasFromCas(100, 0)).toBe(100)
  })
  it('TAS exceeds CAS at altitude', () => {
    // 10000 ft DA: σ≈0.7385, 1/√σ≈1.164 → 150 → ~175
    expect(tasFromCas(150, 10000)).toBe(175)
  })
  it('returns null on bad input', () => {
    expect(tasFromCas('x', 10000)).toBeNull()
  })
})
