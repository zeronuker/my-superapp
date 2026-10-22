// Writes Briefing's already-fetched results into each of the 3 standalone
// modules' own localStorage cache — same shape each module writes for
// itself (see METARTAFCalculator.jsx/NotamViewer.jsx/SigmetViewer.jsx's own
// saveCache) — so opening METAR/TAF, NOTAM or SIGMET directly afterwards
// shows this same route + data already loaded, with zero extra API calls.
// Always overwrites; there's no merge with whatever a module already had.

import { METAR_CACHE_KEY, NOTAM_CACHE_KEY, SIGMET_CACHE_KEY } from '../utils/moduleCacheKeys'

// METAR/TAF history depth Briefing fetches with — also recorded as the
// synced METAR/TAF cache's `hours`, so it reflects what was actually fetched.
export const BRIEFING_METAR_HOURS = 2

function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {}
}

// `snapshotAt` (ms) marks a sync from a SAVED briefing: each module shows a
// "saved snapshot, may be outdated" banner and the NOTAM cache carries the
// already-parsed notams (a save doesn't keep the raw rows). `fetchedAt` stays
// "now" either way so the modules' 12 h expiry doesn't wipe an old snapshot
// the moment it is opened.
export function syncModuleCaches({ route, weatherList, notamResult, resolvedFirs, scopedSigmets, hours, snapshotAt }) {
  const fetchedAt = Date.now()
  const { dep, arr, routeText, destAlts, enrouteCount, enrouteAlts } = route

  const results = {}
  for (const t of weatherList) {
    if (!t.key) continue
    results[t.key] = {
      icao: t.icao, label: t.label,
      metar: t.metar, taf: t.taf,
      metarSource: t.metarSource, tafSource: t.tafSource,
      error: null,
    }
  }
  safeSet(METAR_CACHE_KEY, { dep, arr, routeText, destAlts, enrouteCount, enrouteAlts, hours, results, fetchedAt, snapshotAt })

  safeSet(NOTAM_CACHE_KEY, {
    dep, arr, routeText, destAlts, enrouteCount, enrouteAlts,
    extraChips: resolvedFirs.map(f => ({ icao: f.icao, name: f.name, type: 'fir' })),
    ...(snapshotAt ? { snapshot: { at: snapshotAt, notams: notamResult.notams } } : { rawPerIcao: notamResult.rawPerIcao }),
    fetchedAt,
  })

  safeSet(SIGMET_CACHE_KEY, {
    dep, arr, routeText, destAlts, enrouteCount, enrouteAlts,
    chips: resolvedFirs,
    sigmets: scopedSigmets,
    fetchedAt, snapshotAt,
  })
}

// Same sync, fed from a saved briefing's stored data instead of a live fetch.
export function syncSnapshotCaches(route, data) {
  syncModuleCaches({
    route,
    weatherList: data.airports || [],
    notamResult: { notams: Object.values(data.notamsByIcao || {}).flat() },
    resolvedFirs: data.firsUsed || [],
    scopedSigmets: data.sigmets || [],
    hours: BRIEFING_METAR_HOURS,
    snapshotAt: data.fetchedAt || Date.now(),
  })
}
