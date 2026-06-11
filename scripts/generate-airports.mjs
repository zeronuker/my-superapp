/**
 * Regenerates src/data/airports.json from the public-domain OurAirports dataset.
 *
 *   node scripts/generate-airports.mjs
 *
 * Filters to airports that an airliner would actually use: type large_airport
 * or medium_airport, with a valid 4-letter ICAO ident. Output: ICAO → {name,
 * city, country, lat, lng}. Country is resolved from the 2-letter ISO code via
 * OurAirports' countries.csv.
 *
 * Source: https://ourairports.com/data/  (public domain)
 */
import { writeFileSync } from 'node:fs'

const AIRPORTS_URL  = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const COUNTRIES_URL = 'https://davidmegginson.github.io/ourairports-data/countries.csv'

// Minimal RFC-4180 CSV parser (handles quoted fields with commas + "" escapes)
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

function toObjects(rows) {
  const header = rows[0]
  return rows.slice(1).filter(r => r.length === header.length).map(r => {
    const o = {}
    header.forEach((h, i) => { o[h] = r[i] })
    return o
  })
}

const ICAO_RE = /^[A-Z]{4}$/
const KEEP_TYPES = new Set(['large_airport', 'medium_airport'])

console.log('Fetching countries…')
const countriesCsv = await (await fetch(COUNTRIES_URL)).text()
const countryName = {}
for (const c of toObjects(parseCsv(countriesCsv))) countryName[c.code] = c.name

console.log('Fetching airports…')
const airportsCsv = await (await fetch(AIRPORTS_URL)).text()
const airports = toObjects(parseCsv(airportsCsv))

const out = {}
let kept = 0
for (const a of airports) {
  if (!KEEP_TYPES.has(a.type)) continue
  const icao = (a.ident || '').toUpperCase()
  if (!ICAO_RE.test(icao)) continue
  const lat = parseFloat(a.latitude_deg)
  const lng = parseFloat(a.longitude_deg)
  if (Number.isNaN(lat) || Number.isNaN(lng)) continue

  out[icao] = {
    name:    a.name,
    city:    a.municipality || '',
    country: countryName[a.iso_country] || a.iso_country || '',
    lat:     Math.round(lat * 1e4) / 1e4,
    lng:     Math.round(lng * 1e4) / 1e4,
  }
  kept++
}

// Stable key order for clean diffs
const sorted = {}
for (const k of Object.keys(out).sort()) sorted[k] = out[k]

writeFileSync(
  new URL('../src/data/airports.json', import.meta.url),
  JSON.stringify(sorted) + '\n'
)

const large  = airports.filter(a => a.type === 'large_airport' && ICAO_RE.test((a.ident || '').toUpperCase())).length
console.log(`Wrote ${kept} airports (${large} large + ${kept - large} medium) to src/data/airports.json`)
