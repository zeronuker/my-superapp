import { describe, it, expect } from 'vitest'
import { interp1D, interp2D } from './gridInterpolation'

describe('interp1D', () => {
  const xs = [0, 10, 20, 30]
  const ys = [100, 200, null, 400]

  it('returns an exact match without interpolating', () => {
    expect(interp1D(10, xs, ys)).toBe(200)
  })
  it('interpolates between two known points', () => {
    expect(interp1D(5, xs, ys)).toBe(150)
  })
  it('returns null when a bracketing value is null', () => {
    expect(interp1D(15, xs, ys)).toBeNull()
    expect(interp1D(25, xs, ys)).toBeNull()
  })
  it('returns null outside the axis range', () => {
    expect(interp1D(-5, xs, ys)).toBeNull()
    expect(interp1D(35, xs, ys)).toBeNull()
  })
  it('works on a descending axis', () => {
    const desc = [30, 20, 10, 0]
    const descYs = [400, 300, 200, 100]
    // x=15 sits between (10, 200) and (20, 300) -> midpoint 250
    expect(interp1D(15, desc, descYs)).toBe(250)
  })
})

describe('interp2D', () => {
  const rows = [10, 20, 30]
  const cols = [0, 100]
  const data = { '10': [1, 2], '20': [3, 4], '30': [5, null] }

  it('exact row + exact col', () => {
    expect(interp2D(20, 100, rows, cols, data)).toBe(4)
  })
  it('exact row, interpolated col', () => {
    expect(interp2D(10, 50, rows, cols, data)).toBe(1.5)
  })
  it('interpolated row, exact col', () => {
    expect(interp2D(15, 0, rows, cols, data)).toBe(2)
  })
  it('interpolated row and col', () => {
    expect(interp2D(15, 50, rows, cols, data)).toBe(2.5)
  })
  it('returns null when one bracketing row has a null cell needed for the lookup', () => {
    expect(interp2D(25, 100, rows, cols, data)).toBeNull()
  })
  it('returns null outside the row range', () => {
    expect(interp2D(40, 0, rows, cols, data)).toBeNull()
  })
})
