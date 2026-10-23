// Pure helper for batched NOTAM requests (see notamAPI.js fetchNotams).
// One autorouter call now covers several airports/FIRs; this sorts the rows
// back to the location each one belongs to, so the per-ICAO cache shape and
// the parser downstream stay unchanged.

// autorouter only takes 4-character location codes and rejects the WHOLE request
// if one entry is malformed, so a typo must never reach a batch.
export const NOTAM_CODE_RE = /^[A-Z]{2}[A-Z0-9]{2}$/

// Every location a row names: item A (a list or a plain string, possibly
// space-separated) plus the FIR field.
function rowLocations(row) {
  return [row.itema, row.fir]
    .flat()
    .filter(Boolean)
    .flatMap(x => String(x).toUpperCase().split(/\s+/))
}

/**
 * @param {object[]} rows      NOTAM rows from one batched autorouter request
 * @param {string[]} icaoList  the locations that were requested
 * @returns {Record<string, object[]>}  rows per requested ICAO (upper-case).
 *   A row naming several requested locations appears under each (the parser
 *   de-duplicates by id). A row naming none is kept under the first location
 *   so nothing is ever lost.
 */
export function splitRowsByIcao(rows, icaoList) {
  const wanted = [...new Set((icaoList || []).map(x => String(x).toUpperCase()))]
  const out = Object.fromEntries(wanted.map(icao => [icao, []]))
  if (!wanted.length) return out

  for (const row of rows || []) {
    const hits = rowLocations(row).filter(loc => loc in out)
    if (!hits.length) { out[wanted[0]].push(row); continue }
    for (const loc of new Set(hits)) out[loc].push(row)
  }
  return out
}
