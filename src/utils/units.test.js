import { describe, it, expect } from 'vitest'
import { convert } from './units'

describe('convert', () => {
  it('length', () => {
    expect(convert('length', 1, 'nm', 'km')).toBeCloseTo(1.852, 3)
    expect(convert('length', 1000, 'ft', 'm')).toBeCloseTo(304.8, 1)
    expect(convert('length', 1, 'mi', 'km')).toBeCloseTo(1.609344, 5)
  })
  it('speed', () => {
    expect(convert('speed', 100, 'kt', 'kmh')).toBeCloseTo(185.2, 1)
    expect(convert('speed', 1, 'm/s', 'kt')).toBeCloseTo(1.94384, 4)
  })
  it('mass', () => {
    expect(convert('mass', 1, 'kg', 'lb')).toBeCloseTo(2.20462, 4)
  })
  it('temp', () => {
    expect(convert('temp', 0, '°C', '°F')).toBeCloseTo(32, 6)
    expect(convert('temp', 100, '°C', 'K')).toBeCloseTo(373.15, 2)
    expect(convert('temp', -40, '°C', '°F')).toBeCloseTo(-40, 6)
    expect(convert('temp', 98.6, '°F', '°C')).toBeCloseTo(37, 4)
  })
  it('same unit is identity', () => {
    expect(convert('length', 42, 'm', 'm')).toBe(42)
  })
  it('returns null on bad input', () => {
    expect(convert('length', 'x', 'm', 'ft')).toBeNull()
    expect(convert('length', 1, 'm', 'parsec')).toBeNull()
    expect(convert('nope', 1, 'a', 'b')).toBeNull()
  })
})
