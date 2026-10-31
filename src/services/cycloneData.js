// Current tropical cyclones from GDACS (keyless, open to browsers): the list of storms, then for each storm that is near
// the picture's area its geometry file (about 460 KB: track, cone, wind areas). The maths is in utils/cyclones.js.

import { parseStormList, summarizeStormGeometry, stormReachesArea } from '../utils/cyclones'
import { unwrapLng } from '../utils/satSnapshot'

const LIST_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP?eventlist=TC'
const FETCH_MS = 30000
const MAX_STORMS = 6                  // geometry files fetched per picture
const NEAR_DEG = 40                   // a storm further than this from the area cannot reach it with its cone

const withTimeout = signal => (AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(FETCH_MS)].filter(Boolean)) : signal)

async function fetchJson(url, signal) {
  const r = await fetch(url, { signal: withTimeout(signal) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

let listCache = { at: 0, storms: [] }
const LIST_TTL_MS = 10 * 60000

/**
 * GDACS's list of current storms (position, alert, wind), kept for 10 minutes so the region dots and the pictures
 * share one download. `fresh` skips the kept copy (a picture being rebuilt wants today's list).
 */
export async function fetchStormList(signal, { fresh = false } = {}) {
  if (!fresh && Date.now() - listCache.at < LIST_TTL_MS) return listCache.storms
  const storms = parseStormList(await fetchJson(LIST_URL, signal))
  listCache = { at: Date.now(), storms }
  return storms
}

const EMPTY = { track: [], nowIndex: 0, forecast: [], cone: null, radii: [], advisory: '' }

/**
 * Storms whose track, cone or wind areas reach `area` ({ west, east, south, north } in degrees, east may pass 180).
 * Resolves [{ ...listEntry, summary }]; a storm whose geometry file could not be fetched keeps an empty summary
 * (its position still shows). Rejects when GDACS's storm list itself cannot be fetched.
 */
export async function fetchStorms(area, signal) {
  const storms = await fetchStormList(signal, { fresh: true })
  const mid = (area.west + area.east) / 2
  const near = storms.filter(s => {
    const x = unwrapLng(s.position[0], mid)
    return x >= area.west - NEAR_DEG && x <= area.east + NEAR_DEG && s.position[1] >= area.south - NEAR_DEG && s.position[1] <= area.north + NEAR_DEG
  }).slice(0, MAX_STORMS)

  const withGeometry = await Promise.all(near.map(async s => {
    try {
      const summary = s.geometryUrl ? summarizeStormGeometry(await fetchJson(s.geometryUrl, signal), s.position) : EMPTY
      return { ...s, summary }
    } catch (e) {
      if (signal?.aborted) throw e
      return { ...s, summary: EMPTY }
    }
  }))
  return withGeometry.filter(s => stormReachesArea(s.position, s.summary, area))
}
