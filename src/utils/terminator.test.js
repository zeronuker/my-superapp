import { describe, it, expect } from 'vitest'
import { solarDeclination, subsolarLongitude, nightRegionPath } from './terminator'

describe('solarDeclination', () => {
  it('is near +23.44° at the June solstice', () => {
    expect(solarDeclination(new Date('2026-06-21T00:00:00Z'))).toBeGreaterThan(23)
  })

  it('is near -23.44° at the December solstice', () => {
    expect(solarDeclination(new Date('2026-12-21T00:00:00Z'))).toBeLessThan(-23)
  })

  it('is near 0° at the equinoxes', () => {
    expect(Math.abs(solarDeclination(new Date('2026-03-20T00:00:00Z')))).toBeLessThan(2)
  })
})

describe('subsolarLongitude', () => {
  it('is ~0° at UTC noon', () => {
    expect(Math.abs(subsolarLongitude(new Date('2026-01-15T12:00:00Z')))).toBeLessThan(1)
  })

  it('is ~180° at UTC midnight', () => {
    expect(Math.abs(subsolarLongitude(new Date('2026-01-15T00:00:00Z')))).toBeGreaterThan(179)
  })

  it('is ~90°E at UTC 06:00', () => {
    expect(subsolarLongitude(new Date('2026-01-15T06:00:00Z'))).toBeCloseTo(90, 0)
  })
})

describe('nightRegionPath', () => {
  const project = (lat, lng) => ({ x: (lng + 180) / 360 * 900, y: (90 - lat) / 180 * 450 })

  it('returns a closed SVG path', () => {
    const d = nightRegionPath(new Date('2026-06-21T12:00:00Z'), project, 900, 450)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('does not blow up at the equinox (declination ~ 0)', () => {
    const d = nightRegionPath(new Date('2026-03-20T12:00:00Z'), project, 900, 450)
    expect(d).not.toContain('NaN')
    expect(d).not.toContain('Infinity')
  })
})
