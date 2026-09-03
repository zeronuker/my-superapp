// Shared across the 3 standalone modules (each reads/writes its own key)
// and briefingSync.js / ResetButton's "reset all 3" path (which need to
// address the other modules' caches from outside their own component).
export const METAR_CACHE_KEY  = 'cb-metar-cache'
export const NOTAM_CACHE_KEY  = 'cb-notam-cache'
export const SIGMET_CACHE_KEY = 'cb-sigmet-cache'
