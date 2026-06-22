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
  volume: {
    label: 'Volume',
    base: 'L',
    units: { L: 1, USG: 3.785411784, impgal: 4.54609 },
  },
  area: {
    label: 'Area',
    base: 'm²',
    units: { 'm²': 1, 'km²': 1e6, 'ft²': 0.09290304, acre: 4046.8564224 },
  },
  pressure: {
    label: 'Pressure',
    base: 'hPa',
    units: { hPa: 1, inHg: 33.8639, mmHg: 1.33322, psi: 68.9476, atm: 1013.25 },
  },
  time: {
    label: 'Time',
    base: 's',
    units: { s: 1, min: 60, hr: 3600 },
  },
  angle: {
    label: 'Angle',
    base: 'deg',
    units: { deg: 1, rad: 57.29577951308232 },
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

// Fuel mass ↔ volume conversion. Mass/volume-only conversions use the plain
// factor tables; crossing domains (e.g. kg → litres) additionally requires a
// density (kg per litre — varies by fuel type, so it's a user-supplied input
// rather than a fixed constant).
export const FUEL_MASS_UNITS   = { kg: 1, lb: 0.453592 }
export const FUEL_VOLUME_UNITS = { L: 1, USG: 3.785411784, impgal: 4.54609 }

/**
 * @param densityKgPerL fuel density in kg/L — required only when `from`/`to`
 *   are in different domains (mass vs volume); ignored otherwise.
 * @returns {number|null} converted value, or null on invalid input
 */
export function convertFuel(value, from, to, densityKgPerL) {
  const v = parseFloat(value)
  if (Number.isNaN(v)) return null

  const fromIsMass = from in FUEL_MASS_UNITS
  const toIsMass   = to in FUEL_MASS_UNITS
  const fromIsVol  = from in FUEL_VOLUME_UNITS
  const toIsVol    = to in FUEL_VOLUME_UNITS
  if (!fromIsMass && !fromIsVol) return null
  if (!toIsMass && !toIsVol) return null

  if (fromIsMass === toIsMass) {
    const table = fromIsMass ? FUEL_MASS_UNITS : FUEL_VOLUME_UNITS
    return v * table[from] / table[to]
  }

  const d = parseFloat(densityKgPerL)
  if (Number.isNaN(d) || d <= 0) return null

  if (fromIsMass) {
    const litres = (v * FUEL_MASS_UNITS[from]) / d
    return litres / FUEL_VOLUME_UNITS[to]
  }
  const kg = v * FUEL_VOLUME_UNITS[from] * d
  return kg / FUEL_MASS_UNITS[to]
}
