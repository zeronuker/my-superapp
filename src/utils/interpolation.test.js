import { describe, it, expect } from 'vitest'
import {
  linearInterpolate,
  interpolateAltitude,
  interpolateAltitude2D,
} from './interpolation'

describe('linearInterpolate', () => {
  it('interpolates the midpoint', () => {
    expect(linearInterpolate(0, 0, 10, 100, 5)).toBe(50)
  })
  it('interpolates an arbitrary point', () => {
    expect(linearInterpolate(10, 20, 20, 40, 15)).toBe(30)
  })
  it('returns the endpoints exactly', () => {
    expect(linearInterpolate(0, 0, 10, 100, 0)).toBe(0)
    expect(linearInterpolate(0, 0, 10, 100, 10)).toBe(100)
  })
  it('extrapolates beyond the range (no clamping)', () => {
    expect(linearInterpolate(0, 0, 10, 100, 15)).toBe(150)
  })
  it('returns null for a vertical line (x2 === x1)', () => {
    expect(linearInterpolate(5, 0, 5, 100, 5)).toBeNull()
  })
  it('returns null on non-numeric input', () => {
    expect(linearInterpolate('a', 0, 10, 100, 5)).toBeNull()
    expect(linearInterpolate(0, 0, 10, 100, 'x')).toBeNull()
  })
})

describe('interpolateAltitude', () => {
  const weights = [60, 70, 80]
  const alts = [40000, 38000, 36000]

  it('interpolates between two weight points', () => {
    expect(interpolateAltitude(65, weights, alts)).toBe(39000)
  })
  it('returns the value at an exact lower endpoint', () => {
    expect(interpolateAltitude(60, weights, alts)).toBe(40000)
  })
  it('returns the value at the exact upper endpoint', () => {
    expect(interpolateAltitude(80, weights, alts)).toBe(36000)
  })
  it('returns null below the table range', () => {
    expect(interpolateAltitude(50, weights, alts)).toBeNull()
  })
  it('returns null above the table range', () => {
    expect(interpolateAltitude(90, weights, alts)).toBeNull()
  })
  it('returns null when fewer than two points', () => {
    expect(interpolateAltitude(60, [60], [40000])).toBeNull()
  })
  it('returns null on mismatched array lengths', () => {
    expect(interpolateAltitude(65, [60, 70], [40000])).toBeNull()
  })
  it('returns null when a bracketing altitude is null', () => {
    expect(interpolateAltitude(65, weights, [40000, null, 36000])).toBeNull()
  })
  it('rounds to the nearest foot', () => {
    // 63 → 40000 + 3*(-2000)/10 = 39400
    expect(interpolateAltitude(63, weights, alts)).toBe(39400)
  })
})

describe('interpolateAltitude2D', () => {
  const weights = [60, 70]
  const temperatures = ['ISA', 'ISA+10', 'ISA+20']
  const data = {
    ISA:       [40000, 38000],
    'ISA+10':  [39000, 37000],
    'ISA+20':  [38000, 36000],
  }

  it('exact temperature column, interpolated weight', () => {
    const r = interpolateAltitude2D(65, 0, weights, temperatures, data)
    expect(r.altitude).toBe(39000)
    expect(r.lowerCol).toBe('ISA')
    expect(r.upperCol).toBeNull()
    expect(r.clamped).toBe(false)
  })

  it('interpolates across both weight and ISA-deviation axes', () => {
    // dev 5 between ISA(0) and ISA+10(10), weight 60
    // lowerAlt=40000, upperAlt=39000 → 40000 + 5*(39000-40000)/10 = 39500
    const r = interpolateAltitude2D(60, 5, weights, temperatures, data)
    expect(r.altitude).toBe(39500)
    expect(r.lowerCol).toBe('ISA')
    expect(r.upperCol).toBe('ISA+10')
    expect(r.clamped).toBe(false)
  })

  it('clamps a deviation above the table range', () => {
    const r = interpolateAltitude2D(65, 30, weights, temperatures, data)
    expect(r.clamped).toBe(true)
    // clamped to ISA+20 exact column → interpolateAltitude(65,[60,70],[38000,36000]) = 37000
    expect(r.altitude).toBe(37000)
  })

  it('returns null on non-numeric input', () => {
    expect(interpolateAltitude2D('x', 0, weights, temperatures, data)).toBeNull()
  })
})
