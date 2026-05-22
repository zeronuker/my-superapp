/**
 * Linear interpolation on weight axis for Boeing performance tables
 * @param {number} weight - Aircraft weight in thousands of kg
 * @param {array} weights - Array of weight points from lookup table
 * @param {array} altitudes - Array of altitude values corresponding to weights
 * @returns {number} Interpolated altitude value
 */
export function interpolateAltitude(weight, weights, altitudes) {
  if (!weight || weights.length < 2 || weights.length !== altitudes.length) {
    return null
  }

  const w = parseFloat(weight)

  // Check bounds
  if (w < weights[0] || w > weights[weights.length - 1]) {
    return null
  }

  // Find two surrounding points
  for (let i = 0; i < weights.length - 1; i++) {
    const w1 = weights[i]
    const w2 = weights[i + 1]

    if (w >= w1 && w <= w2) {
      const h1 = altitudes[i]
      const h2 = altitudes[i + 1]

      if (h1 === null || h2 === null) return null

      // Linear interpolation formula: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
      const interpolated = h1 + (w - w1) * (h2 - h1) / (w2 - w1)

      // Round to nearest foot
      return Math.round(interpolated)
    }
  }

  return null
}

/**
 * General linear interpolation (for interpolation calculator)
 * y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
 */
export function linearInterpolate(x1, y1, x2, y2, x) {
  const x1n = parseFloat(x1)
  const y1n = parseFloat(y1)
  const x2n = parseFloat(x2)
  const y2n = parseFloat(y2)
  const xn = parseFloat(x)

  if (isNaN(x1n) || isNaN(y1n) || isNaN(x2n) || isNaN(y2n) || isNaN(xn)) {
    return null
  }

  if (x2n === x1n) {
    return null // Undefined slope
  }

  const result = y1n + (xn - x1n) * (y2n - y1n) / (x2n - x1n)
  return parseFloat(result.toFixed(4))
}

function extractTempValue(tempStr) {
  if (tempStr === 'ISA') return 0
  const match = tempStr.match(/ISA([+-]\d+)/)
  return match ? parseInt(match[1]) : 0
}

/**
 * 2D interpolation: interpolates on both weight and ISA deviation axes.
 * Returns { altitude, lowerCol, upperCol, lowerAlt, upperAlt, clamped }
 * where clamped=true means the deviation was outside the table range.
 */
export function interpolateAltitude2D(weight, isaDeviation, weights, temperatures, data) {
  const dev = parseFloat(isaDeviation)
  const w = parseFloat(weight)
  if (isNaN(dev) || isNaN(w)) return null

  const tempValues = temperatures.map(extractTempValue)
  const minDev = tempValues[0]
  const maxDev = tempValues[tempValues.length - 1]

  // Clamp to table range — don't extrapolate beyond manual data
  const clampedDev = Math.max(minDev, Math.min(maxDev, dev))
  const clamped = clampedDev !== dev

  // Find the two surrounding temperature columns
  let lowerIdx = 0
  for (let i = 0; i < tempValues.length; i++) {
    if (tempValues[i] <= clampedDev) lowerIdx = i
  }

  const lowerCol = temperatures[lowerIdx]

  // Exact match — no temperature interpolation needed
  if (tempValues[lowerIdx] === clampedDev) {
    const lowerAlt = interpolateAltitude(w, weights, data[lowerCol])
    return { altitude: lowerAlt, lowerCol, upperCol: null, lowerAlt, upperAlt: null, clamped }
  }

  const upperIdx = clampedDev >= maxDev ? lowerIdx : lowerIdx + 1
  const upperCol = temperatures[upperIdx]
  const lowerAlt = interpolateAltitude(w, weights, data[lowerCol])

  if (lowerAlt === null) {
    return { altitude: null, lowerCol, upperCol, lowerAlt: null, upperAlt: null, clamped }
  }

  const upperAlt = interpolateAltitude(w, weights, data[upperCol])
  if (upperAlt === null) {
    return { altitude: lowerAlt, lowerCol, upperCol, lowerAlt, upperAlt: null, clamped }
  }

  const t1 = tempValues[lowerIdx]
  const t2 = tempValues[upperIdx]
  if (t2 === t1) return { altitude: lowerAlt, lowerCol, upperCol, lowerAlt, upperAlt, clamped }
  const altitude = Math.round(lowerAlt + (clampedDev - t1) * (upperAlt - lowerAlt) / (t2 - t1))

  return { altitude, lowerCol, upperCol, lowerAlt, upperAlt, clamped }
}
