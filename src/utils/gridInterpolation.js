// Direction-agnostic 2D linear interpolation over a numeric row/column grid,
// shared by the Go-Around Climb Gradient and Quick Turnaround Limit Weight
// calculators (both digitized from FCOM Performance Dispatch tables keyed by
// two plain-numeric axes — unlike interpolateAltitude2D, which is built for
// the "ISA+N" band-string axis the altitude-capability tables use).
//
// A blank cell in the source table (a combination the manual doesn't
// publish) stays null all the way through rather than being guessed at.

import { linearInterpolate } from './interpolation'

function bracket(x, xs) {
  const ascending = xs[xs.length - 1] >= xs[0]
  const sorted = ascending ? xs : [...xs].slice().reverse()
  if (x < sorted[0] || x > sorted[sorted.length - 1]) return null
  for (let i = 0; i < sorted.length - 1; i++) {
    if (x >= sorted[i] && x <= sorted[i + 1]) {
      return ascending ? [i, i + 1] : [xs.length - 1 - i, xs.length - 2 - i]
    }
  }
  return null
}

export function interp1D(x, xs, ys) {
  const exactIdx = xs.findIndex(v => v === x)
  if (exactIdx !== -1) return ys[exactIdx]
  const b = bracket(x, xs)
  if (!b) return null
  const [i0, i1] = b
  const y0 = ys[i0], y1 = ys[i1]
  if (y0 == null || y1 == null) return null
  return linearInterpolate(xs[i0], y0, xs[i1], y1, x)
}

export function interp2D(rowVal, colVal, rowAxis, colAxis, data) {
  const exactRow = rowAxis.find(r => r === rowVal)
  if (exactRow !== undefined) return interp1D(colVal, colAxis, data[String(exactRow)])
  const b = bracket(rowVal, rowAxis)
  if (!b) return null
  const [i0, i1] = b
  const v0 = interp1D(colVal, colAxis, data[String(rowAxis[i0])])
  const v1 = interp1D(colVal, colAxis, data[String(rowAxis[i1])])
  if (v0 == null || v1 == null) return null
  return linearInterpolate(rowAxis[i0], v0, rowAxis[i1], v1, rowVal)
}
