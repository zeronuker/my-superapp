import { describe, it, expect } from 'vitest'
import { clockToElapsedTotal } from './useFlight'

const utc = (h, m = 0) => new Date(Date.UTC(2026, 0, 10, h, m))

describe('clockToElapsedTotal (UTC)', () => {
  it('mid-flight: dep 0900, arr 1700, now 1300 → 4h elapsed / 8h total', () => {
    const r = clockToElapsedTotal('0900', '1700', 'utc', utc(13))
    expect(r.elapsedHours).toBeCloseTo(4, 5)
    expect(r.totalHours).toBeCloseTo(8, 5)
  })

  it('accepts HH:MM and HHMM', () => {
    const r = clockToElapsedTotal('09:00', '17:30', 'utc', utc(12))
    expect(r.totalHours).toBeCloseTo(8.5, 5)
    expect(r.elapsedHours).toBeCloseTo(3, 5)
  })

  it('overnight: dep 2200, arr 0600, now 0200 → 4h elapsed / 8h total', () => {
    const r = clockToElapsedTotal('2200', '0600', 'utc', utc(2))
    expect(r.totalHours).toBeCloseTo(8, 5)
    expect(r.elapsedHours).toBeCloseTo(4, 5)
  })

  it('clamps elapsed to [0, total]', () => {
    // now after arrival → elapsed capped at total
    const r = clockToElapsedTotal('0900', '1100', 'utc', utc(15))
    expect(r.elapsedHours).toBeCloseTo(2, 5)
    expect(r.totalHours).toBeCloseTo(2, 5)
  })

  it('returns null on bad input', () => {
    expect(clockToElapsedTotal('99:99', '1700', 'utc', utc(13))).toBeNull()
    expect(clockToElapsedTotal('', '', 'utc', utc(13))).toBeNull()
  })
})
