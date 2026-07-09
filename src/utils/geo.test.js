import { describe, it, expect } from 'vitest'
import { distanceNm, bearingDeg } from './geo'

// WMKK (Kuala Lumpur Intl) → VHHH (Hong Kong Intl), ~1372 nm on a NE bearing
const WMKK = [2.7456, 101.7099]
const VHHH = [22.3080, 113.9185]

describe('distanceNm', () => {
  it('computes great-circle distance', () => {
    expect(distanceNm(...WMKK, ...VHHH)).toBeCloseTo(1372, -1)
  })
  it('is zero for the same point', () => {
    expect(distanceNm(...WMKK, ...WMKK)).toBeCloseTo(0, 2)
  })
})

describe('bearingDeg', () => {
  it('computes initial bearing', () => {
    expect(bearingDeg(...WMKK, ...VHHH)).toBeCloseTo(30, 0)
  })
  it('due north is 0', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5)
  })
  it('due east is 90', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5)
  })
})
