/**
 * Worldwide ICAO airport database — single source of truth.
 * Shared by the prayer Flight tab (useFlight) and NOTAM auto-detect.
 *
 * Data: src/data/airports.json — generated from the public-domain OurAirports
 * dataset (large + medium airports with a valid 4-letter ICAO). Regenerate with
 *   node scripts/generate-airports.mjs
 *
 * Format: ICAO → { name, city, country, lat, lng }
 */
import AIRPORTS from './airports.json'

/**
 * Look up an airport by ICAO code (case-insensitive).
 * Returns the airport object or null if not found.
 */
export function lookupAirport(icao) {
  if (!icao || icao.length < 3) return null
  return AIRPORTS[icao.trim().toUpperCase()] ?? null
}

export default AIRPORTS
