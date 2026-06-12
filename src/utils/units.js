/**
 * Unit conversion for the calculator's CONVERT mode.
 * Linear units convert via a base factor; temperature is handled specially.
 */

// factor = how many base units in 1 of this unit
export const UNIT_CATEGORIES = {
  length: {
    label: 'Length',
    base: 'm',
    units: { m: 1, ft: 0.3048, km: 1000, nm: 1852, mi: 1609.344 },
  },
  speed: {
    label: 'Speed',
    base: 'm/s',
    units: { kt: 0.514444, kmh: 0.277778, mph: 0.44704, 'm/s': 1 },
  },
  mass: {
    label: 'Mass',
    base: 'kg',
    units: { kg: 1, lb: 0.453592, t: 1000 },
  },
  temp: {
    label: 'Temp',
    base: '°C',
    units: { '°C': 1, '°F': 1, K: 1 },   // factors unused — see convert()
  },
}

function toCelsius(v, from) {
  if (from === '°C') return v
  if (from === '°F') return (v - 32) * 5 / 9
  if (from === 'K')  return v - 273.15
  return NaN
}
function fromCelsius(c, to) {
  if (to === '°C') return c
  if (to === '°F') return c * 9 / 5 + 32
  if (to === 'K')  return c + 273.15
  return NaN
}

/**
 * Convert `value` between units of one category.
 * @returns {number|null} converted value, or null on invalid input
 */
export function convert(category, value, from, to) {
  const cat = UNIT_CATEGORIES[category]
  const v = parseFloat(value)
  if (!cat || Number.isNaN(v) || !(from in cat.units) || !(to in cat.units)) return null

  if (category === 'temp') return fromCelsius(toCelsius(v, from), to)
  return v * cat.units[from] / cat.units[to]
}
