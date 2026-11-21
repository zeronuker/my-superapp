import { describe, it, expect } from 'vitest'
import { evaluate } from './mathEval'

describe('evaluate — arithmetic & precedence', () => {
  it('respects × ÷ over + −', () => {
    expect(evaluate('2 + 3 × 4')).toBe(14)
    expect(evaluate('20 ÷ 4 - 1')).toBe(4)
  })
  it('parentheses override precedence', () => {
    expect(evaluate('(2 + 3) × 4')).toBe(20)
    expect(evaluate('2 × (3 + (4 - 1))')).toBe(12)
  })
  it('power is right-associative', () => {
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512)   // 2^(3^2)
    expect(evaluate('2 ^ 3 × 2')).toBe(16)
  })
  it('unary minus', () => {
    expect(evaluate('-5 + 2')).toBe(-3)
    expect(evaluate('3 × -2')).toBe(-6)
    expect(evaluate('-(2 + 3)')).toBe(-5)
  })
  it('a minus in front of a power applies after the power, as on a calculator', () => {
    expect(evaluate('-2^2')).toBe(-4)
    expect(evaluate('-2 ^ 2 + 10')).toBe(6)
    expect(evaluate('3 - 2^2')).toBe(-1)
    expect(evaluate('-3 × 2')).toBe(-6)      // times still binds looser than the minus
    expect(evaluate('2 ^ -3')).toBe(0.125)   // a minus inside the exponent
    expect(evaluate('-2 ^ -2')).toBe(-0.25)
    expect(evaluate('(-2)^2')).toBe(4)
    expect(evaluate('-sin(30)')).toBeCloseTo(-0.5, 9)
    expect(evaluate('5 - -2')).toBe(7)
  })
})

describe('evaluate — functions & constants', () => {
  it('trig in degrees by default', () => {
    expect(evaluate('sin(30)')).toBeCloseTo(0.5, 9)
    expect(evaluate('cos(60)')).toBeCloseTo(0.5, 9)
  })
  it('trig in radians when set', () => {
    expect(evaluate('sin(pi ÷ 2)', 'rad')).toBeCloseTo(1, 9)
  })
  it('inverse trig returns degrees', () => {
    expect(evaluate('asin(0.5)')).toBeCloseTo(30, 9)
    expect(evaluate('atan(1)')).toBeCloseTo(45, 9)
  })
  it('log / ln / sqrt / abs / exp', () => {
    expect(evaluate('log(1000)')).toBeCloseTo(3, 9)
    expect(evaluate('ln(e)')).toBeCloseTo(1, 9)
    expect(evaluate('sqrt(144)')).toBe(12)
    expect(evaluate('√(81)')).toBe(9)
    expect(evaluate('abs(-7)')).toBe(7)
  })
  it('nested functions', () => {
    expect(evaluate('sqrt(sin(30) × 8)')).toBeCloseTo(2, 9)   // sqrt(0.5*8)=2
  })
})

describe('evaluate — errors', () => {
  it('throws on malformed input', () => {
    expect(() => evaluate('2 +')).toThrow()
    expect(() => evaluate('(2 + 3')).toThrow()
    expect(() => evaluate('2 + 3)')).toThrow()
    expect(() => evaluate('foo(2)')).toThrow()
    expect(() => evaluate('1 ÷ 0')).toThrow()    // Infinity rejected
  })
})

describe('evaluate — exact trig values', () => {
  it('gives exactly 0 where the answer is 0 (no 1.2e-16 left over)', () => {
    expect(evaluate('sin(180)')).toBe(0)
    expect(evaluate('sin(360)')).toBe(0)
    expect(evaluate('cos(90)')).toBe(0)
    expect(evaluate('cos(270)')).toBe(0)
    expect(evaluate('tan(180)')).toBe(0)
    expect(evaluate('sin(pi)', 'rad')).toBe(0)
    expect(evaluate('cos(pi ÷ 2)', 'rad')).toBe(0)
  })
  it('keeps ordinary values', () => {
    expect(evaluate('sin(90)')).toBe(1)
    expect(evaluate('cos(0)')).toBe(1)
    expect(evaluate('tan(45)')).toBeCloseTo(1, 12)
    expect(evaluate('sin(0.000001)', 'rad')).toBeCloseTo(0.000001, 12)   // small but real: not snapped
  })
  it('tan at 90° (and 270°, -90°) is an error, not 16 quadrillion', () => {
    expect(() => evaluate('tan(90)')).toThrow()
    expect(() => evaluate('tan(270)')).toThrow()
    expect(() => evaluate('tan(-90)')).toThrow()
    expect(() => evaluate('tan(pi ÷ 2)', 'rad')).toThrow()
    expect(evaluate('tan(89.9)')).toBeGreaterThan(500)
  })
})

