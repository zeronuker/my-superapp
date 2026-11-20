/**
 * Regenerates src/data/iata.json: 3-letter IATA code -> ICAO code, for the airports in src/data/airports.json.
 *
 *   node scripts/generate-iata.mjs
 *
 * The CVR roster names airports by IATA code ("TWU-BKI"); briefings use ICAO ("WBKW"). Source: OurAirports
 * (public domain). A separate file so airports.json does not have to be regenerated (and change) with it.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const airports = JSON.parse(readFileSync(new URL('../src/data/airports.json', import.meta.url), 'utf8'))

// Same minimal RFC-4180 parser as generate-airports.mjs
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const [header, ...rows] = parseCsv(await (await fetch(AIRPORTS_URL)).text())
const col = Object.fromEntries(header.map((h, i) => [h, i]))

const out = {}
for (const r of rows) {
  const iata = (r[col.iata_code] || '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(iata)) continue
  // airports.json holds both the old (ident) and the current (icao_code) code; prefer the ident, else the current one.
  const icao = [r[col.ident], r[col.icao_code]].map(s => (s || '').toUpperCase()).find(c => airports[c])
  if (icao && !out[iata]) out[iata] = icao
}

const sorted = {}
for (const k of Object.keys(out).sort()) sorted[k] = out[k]
writeFileSync(new URL('../src/data/iata.json', import.meta.url), JSON.stringify(sorted) + '\n')
console.log(`Wrote ${Object.keys(sorted).length} IATA codes to src/data/iata.json`)
