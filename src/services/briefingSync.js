// Writes Briefing's already-fetched results into each of the 3 standalone
// modules' own localStorage cache — same shape each module writes for
// itself (see METARTAFCalculator.jsx/NotamViewer.jsx/SigmetViewer.jsx's own
// saveCache) — so opening METAR/TAF, NOTAM or SIGMET directly afterwards
// shows this same route + data already loaded, with zero extra API calls.
// Always overwrites; there's no merge with whatever a module already had.

const METAR_CACHE_KEY = 'cb-metar-cache'
const NOTAM_CACHE_KEY = 'cb-notam-cache'
const SIGMET_CACHE_KEY = 'cb-sigmet-cache'

function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {}
}

export function syncModuleCaches({ route, weatherList, notamResult, resolvedFirs, scopedSigmets, hours }) {
  const fetchedAt = Date.now()
  const { dep, arr, destAlts, enrouteCount, enrouteAlts } = route

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
  safeSet(METAR_CACHE_KEY, { dep, arr, destAlts, enrouteCount, enrouteAlts, hours, results, fetchedAt })

  safeSet(NOTAM_CACHE_KEY, {
    dep, arr, destAlts, enrouteCount, enrouteAlts,
    extraChips: resolvedFirs.map(f => ({ icao: f.icao, name: f.name, type: 'fir' })),
    rawPerIcao: notamResult.rawPerIcao,
    fetchedAt,
  })

  safeSet(SIGMET_CACHE_KEY, {
    dep, arr, destAlts, enrouteCount, enrouteAlts,
    chips: resolvedFirs,
    sigmets: scopedSigmets,
    fetchedAt,
  })
}
