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

/**
 * Search airports by ICAO code, name, or city (case-insensitive). ICAO
 * prefix matches are ranked first. Returns [] for queries under 2 chars.
 */
export function searchAirports(query, limit = 8) {
  const q = query?.trim().toUpperCase()
  if (!q || q.length < 2) return []

  const starts = [], contains = []
  for (const [icao, a] of Object.entries(AIRPORTS)) {
    if (icao.startsWith(q)) starts.push({ icao, ...a })
    else if (icao.includes(q) || a.name.toUpperCase().includes(q) || a.city.toUpperCase().includes(q)) contains.push({ icao, ...a })
    if (starts.length + contains.length >= limit * 3) break
  }
  return [...starts, ...contains].slice(0, limit)
}

export default AIRPORTS
