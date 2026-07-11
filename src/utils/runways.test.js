import { describe, it, expect } from 'vitest'
import { normalizeRunways, fmtSurface, windComponents, fmtWindComponent } from './runways'

// Shape confirmed against AeroDataBox's /airports/{codeType}/{code}/runways
// response (RapidAPI console, WMKK, 11 Jul 2026).
const RAW_RUNWAYS = [
  { name: '14L', trueHdg: 140, length: { meter: 4000 }, surface: 'Asphalt', isClosed: false, hasLighting: true },
  { name: '32R', trueHdg: 320, length: { meter: 4000 }, surface: 'Asphalt', isClosed: false, hasLighting: true },
  { name: '05', trueHdg: 50, length: { meter: 3200 }, surface: 'Asphalt', isClosed: true, hasLighting: null },
]

describe('normalizeRunways', () => {
  it('maps and sorts runway entries', () => {
    const r = normalizeRunways(RAW_RUNWAYS)
    expect(r).toHaveLength(3)
    expect(r.map(x => x.name)).toEqual(['05', '14L', '32R'])
    expect(r[1]).toEqual({ name: '14L', headingDeg: 140, lengthM: 4000, surface: 'Asphalt', closed: false, hasLighting: true })
    expect(r[0].closed).toBe(true)
  })
  it('returns an empty array for a missing/malformed response', () => {
    expect(normalizeRunways(null)).toEqual([])
    expect(normalizeRunways(undefined)).toEqual([])
  })
})

describe('fmtSurface', () => {
  it('expands DryLakebed to two words', () => { expect(fmtSurface('DryLakebed')).toBe('Dry Lakebed') })
  it('passes through known single-word surfaces', () => { expect(fmtSurface('Asphalt')).toBe('Asphalt') })
  it('falls back to Unknown for missing input', () => { expect(fmtSurface(null)).toBe('Unknown') })
})

describe('windComponents', () => {
  it('reads pure headwind when wind is aligned with the runway', () => {
    const wc = windComponents(140, 10, 140)
    expect(wc.headwind).toBe(10)
    expect(wc.crosswind).toBe(0)
  })
  it('reads pure tailwind when wind is reciprocal to the runway', () => {
    const wc = windComponents(320, 10, 140)
    expect(wc.headwind).toBe(-10)
    expect(wc.crosswind).toBe(0)
  })
  it('reads pure crosswind when wind is perpendicular to the runway', () => {
    const wc = windComponents(230, 10, 140)
    expect(wc.headwind).toBe(0)
    expect(wc.crosswind).toBe(10)
  })
  it('returns null when any input is missing', () => {
    expect(windComponents(null, 10, 140)).toBeNull()
    expect(windComponents(140, null, 140)).toBeNull()
  })
})

describe('fmtWindComponent', () => {
  it('formats a headwind', () => { expect(fmtWindComponent({ headwind: 5, crosswind: 2 })).toBe('+5 kt HW') })
  it('formats a tailwind', () => { expect(fmtWindComponent({ headwind: -4, crosswind: 1 })).toBe('4 kt TW') })
  it('formats a crosswind once it dominates', () => { expect(fmtWindComponent({ headwind: 2, crosswind: 7 })).toBe('7 kt XW') })
  it('handles missing wind data', () => { expect(fmtWindComponent(null)).toBe('—') })
})
