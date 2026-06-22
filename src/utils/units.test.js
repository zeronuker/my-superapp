import { describe, it, expect } from 'vitest'
import { convert, convertFuel } from './units'

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
  it('volume', () => {
    expect(convert('volume', 1, 'USG', 'L')).toBeCloseTo(3.785411784, 6)
    expect(convert('volume', 1, 'impgal', 'L')).toBeCloseTo(4.54609, 5)
  })
  it('area', () => {
    expect(convert('area', 1, 'acre', 'm²')).toBeCloseTo(4046.8564224, 4)
    expect(convert('area', 1, 'km²', 'm²')).toBe(1e6)
  })
  it('pressure', () => {
    expect(convert('pressure', 1, 'atm', 'hPa')).toBeCloseTo(1013.25, 2)
    expect(convert('pressure', 29.92, 'inHg', 'hPa')).toBeCloseTo(1013.25, 0)
  })
  it('time', () => {
    expect(convert('time', 1, 'hr', 'min')).toBe(60)
    expect(convert('time', 90, 'min', 's')).toBe(5400)
  })
  it('angle', () => {
    expect(convert('angle', Math.PI, 'rad', 'deg')).toBeCloseTo(180, 6)
  })
})

describe('convertFuel', () => {
  it('mass to mass uses plain ratio, ignores density', () => {
    expect(convertFuel(1, 'kg', 'lb', null)).toBeCloseTo(2.20462, 4)
  })
  it('volume to volume uses plain ratio, ignores density', () => {
    expect(convertFuel(1, 'USG', 'L', null)).toBeCloseTo(3.785411784, 6)
  })
  it('mass to volume requires density', () => {
    expect(convertFuel(1, 'kg', 'L', 0.8)).toBeCloseTo(1.25, 4)
    expect(convertFuel(1, 'kg', 'L', null)).toBeNull()
  })
  it('volume to mass requires density', () => {
    expect(convertFuel(1, 'L', 'kg', 0.8)).toBeCloseTo(0.8, 6)
  })
  it('returns null on invalid density for cross-domain conversion', () => {
    expect(convertFuel(1, 'kg', 'USG', 0)).toBeNull()
    expect(convertFuel(1, 'kg', 'USG', -1)).toBeNull()
  })
  it('returns null on bad units', () => {
    expect(convertFuel(1, 'kg', 'parsec', 0.8)).toBeNull()
  })
})
