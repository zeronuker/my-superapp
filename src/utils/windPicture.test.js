import { describe, it, expect } from 'vitest'
import { windSpeedKt, windFromDeg, sampleGrid, windBarb, windShade, windValidTime, MS_TO_KT } from './windPicture'

describe('wind units', () => {
  it('converts m/s to knots', () => {
    expect(windSpeedKt(30, 40)).toBeCloseTo(50 * MS_TO_KT, 6)
  })

  it('gives the direction the wind blows FROM', () => {
    expect(windFromDeg(10, 0)).toBeCloseTo(270, 6)       // blowing east = from the west
    expect(windFromDeg(-10, 0)).toBeCloseTo(90, 6)
    expect(windFromDeg(0, 10)).toBeCloseTo(180, 6)       // blowing north = from the south
    expect(windFromDeg(0, -10)).toBeCloseTo(0, 6)        // from the north (360 reads as 0)
  })
})

describe('sampleGrid', () => {
  // 4 columns (0, 90, 180, 270°E) by 3 rows (90, 0, -90), one value per cell
  const g = { ni: 4, nj: 3, la1: 90, lo1: 0, di: 90, dj: 90, values: Float32Array.from([0, 10, 20, 30, 1, 11, 21, 31, 2, 12, 22, 32]) }

  it('returns grid values at grid points and blends between them', () => {
    expect(sampleGrid(g, 90, 0)).toBeCloseTo(11, 6)
    expect(sampleGrid(g, 45, 0)).toBeCloseTo(6, 6)
    expect(sampleGrid(g, 90, 45)).toBeCloseTo(10.5, 6)
  })

  it('wraps around the globe in longitude', () => {
    expect(sampleGrid(g, -90, 0)).toBeCloseTo(31, 6)     // -90°E = 270°E
    expect(sampleGrid(g, 315, 0)).toBeCloseTo((31 + 1) / 2, 6)
  })

  it('holds at the poles', () => {
    expect(sampleGrid(g, 0, 95)).toBeCloseTo(0, 6)
  })
})

describe('windBarb', () => {
  const count = b => ({ flags: b.flags.length, lines: b.lines.length })

  it('is calm below 5 knots', () => { expect(windBarb(2, 270).calm).toBe(true) })

  it('draws the right feathers: 65 kt is a pennant, a full barb and a half barb', () => {
    const b = windBarb(65, 270)
    expect(count(b)).toEqual({ flags: 1, lines: 2 })
  })

  it('draws 5, 10, 50 and 115 kt', () => {
    expect(count(windBarb(5, 0))).toEqual({ flags: 0, lines: 1 })
    expect(count(windBarb(10, 0))).toEqual({ flags: 0, lines: 1 })
    expect(count(windBarb(50, 0))).toEqual({ flags: 1, lines: 0 })
    expect(count(windBarb(115, 0))).toEqual({ flags: 2, lines: 2 })
  })

  it('points the staff toward where the wind comes from', () => {
    const [, tip] = windBarb(30, 270, 40).staff          // from the west: staff to the left
    expect(tip[0]).toBeCloseTo(-40, 6); expect(tip[1]).toBeCloseTo(0, 6)
    const [, up] = windBarb(30, 0, 40).staff             // from the north: staff up (y is down on screen)
    expect(up[0]).toBeCloseTo(0, 6); expect(up[1]).toBeCloseTo(-40, 6)
  })

  it('puts barbs on the clockwise side in the north and the other side in the south', () => {
    const north = windBarb(10, 270, 40).lines[0][1], south = windBarb(10, 270, 40, true).lines[0][1]
    expect(north[1]).toBeLessThan(0)                      // west wind, northern hemisphere: barbs up (north)
    expect(south[1]).toBeGreaterThan(0)
  })
})

describe('windShade', () => {
  it('is clear in light wind and gets stronger with speed', () => {
    expect(windShade(10)[3]).toBe(0)
    expect(windShade(25)[3]).toBe(0)
    let last = 0
    for (const kt of [40, 60, 80, 100, 120, 150, 180]) { const a = windShade(kt)[3]; expect(a).toBeGreaterThan(last); last = a }
  })

  it('stops changing past the top of the scale', () => {
    expect(windShade(300)).toEqual(windShade(180))
  })
})

describe('windValidTime', () => {
  const now = Date.UTC(2026, 9, 31, 10)
  it('uses the OFP departure time when it is still ahead', () => {
    expect(windValidTime({ flightDetails: { info: { std: '2026-11-01T02:30:00Z' } } }, now)).toBe(Date.UTC(2026, 10, 1, 2, 30))
  })
  it('uses now when there is no OFP or the departure has passed', () => {
    expect(windValidTime({}, now)).toBe(now)
    expect(windValidTime(null, now)).toBe(now)
    expect(windValidTime({ flightDetails: { info: { std: '2026-10-30T02:30:00Z' } } }, now)).toBe(now)
  })
})
