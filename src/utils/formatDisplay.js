/**
 * Shared display formatting for Normal and Scientific calculators.
 * MAX_CALC_VAL: anything above this (absolute value) shows 'OUT OF RANGE'.
 * formatDisplayNum: adds thousands separators while preserving trailing dot
 * and decimal digits as the user types.
 */

export const MAX_CALC_VAL = 999_999_999.999999

/**
 * Format a raw number string for display.
 * - Adds thousands separators to the integer part
 * - Preserves trailing decimal point (user still typing decimals)
 * - Preserves decimal digits verbatim (no rounding)
 * - Passes 'Error', 'OUT OF RANGE', and non-numeric strings through unchanged
 */
export function formatDisplayNum(raw) {
  if (!raw || raw === 'Error' || raw === 'OUT OF RANGE') return raw

  const num = parseFloat(raw)
  if (isNaN(num)) return raw

  const hasTrailingDot = raw.endsWith('.')
  const dotIdx         = raw.indexOf('.')
  const decimalPart    = dotIdx >= 0 ? raw.slice(dotIdx + 1) : null

  // Handle -0.x correctly: use absolute integer + sign separately
  const absInt      = Math.abs(Math.trunc(num))
  const sign        = num < 0 ? '-' : ''
  const intFormatted = sign + absInt.toLocaleString('en-US')

  if (hasTrailingDot)       return intFormatted + '.'
  if (decimalPart !== null) return intFormatted + '.' + decimalPart
  return intFormatted
}
