import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodeGrib2Message } from './grib2'

// A real NOAA GFS message (public domain): the east-west wind (UGRD) at 250 hPa, 1° grid, forecast hour 3 of the
// 2026-10-31 06Z run, cut out of gfs.t06z.pgrb2.1p00.f003 by its byte range.
const bytes = new Uint8Array(readFileSync(new URL('./__fixtures__/gfs_ugrd_250mb_1deg.grb', import.meta.url)))
const m = decodeGrib2Message(bytes)
const at = (lat, lon) => m.values[Math.round((m.la1 - lat) / m.dj) * m.ni + Math.round((((lon % 360) + 360) % 360 - m.lo1) / m.di)]

describe('decodeGrib2Message', () => {
  it('reads the grid: 1° global, 90°N first, 0°E first', () => {
    expect([m.ni, m.nj, m.la1, m.lo1, m.di, m.dj]).toEqual([360, 181, 90, 0, 1, 1])
    expect(m.values).toHaveLength(360 * 181)
  })

  it('gives wind speeds that make physical sense at 250 hPa (m/s)', () => {
    let min = Infinity, max = -Infinity
    for (const x of m.values) { if (x < min) min = x; if (x > max) max = x }
    expect(min).toBeCloseTo(-46.2, 1)
    expect(max).toBeCloseTo(79.7, 1)
  })

  it('puts the westerly jet where it belongs and easterlies over the tropics', () => {
    expect(at(35, 140)).toBeGreaterThan(40)        // jet stream east of Japan
    expect(at(3, 101)).toBeLessThan(0)             // near Kuala Lumpur: easterly
    expect(at(0, 180)).toBeCloseTo(-2.7, 1)
  })

  it('refuses something that is not a GRIB2 message', () => {
    expect(() => decodeGrib2Message(new Uint8Array(100))).toThrow(/not a GRIB2/)
  })
})
