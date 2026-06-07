// localStorage cache for prayer times — 7-day rolling window.
// v2: previous versions keyed by UTC date, which day-shifted entries in
// non-UTC timezones. Bumping the key abandons any poisoned v1 cache.
const CACHE_KEY = 'prayer-module-cache-v2'

function read() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') } catch { return {} }
}

function write(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* storage full */ }
}

/**
 * Local calendar date as YYYY-MM-DD (respects device timezone).
 * MUST be local, not UTC: the rest of the module reasons in local time, so a
 * UTC key (toISOString) shifts entries by a day for part of every day in
 * non-UTC zones (e.g. Malaysia UTC+8), causing day-shifted prayer times.
 */
function localDateStr(date) {
  return date.toLocaleDateString('en-CA')   // en-CA always formats as YYYY-MM-DD
}

function makeKey(lat, lng, date, method, madhab, timeFormat) {
  return `${localDateStr(date)}|${lat.toFixed(3)}|${lng.toFixed(3)}|${method}|${madhab}|${timeFormat}`
}

const DATE_FIELDS = ['imsakDate', 'fajrDate', 'sunriseDate', 'dhuhrDate', 'asrDate', 'maghribDate', 'ishaDate']

export function getCached(lat, lng, date, method, madhab, timeFormat) {
  const cache = read()
  const entry = cache[makeKey(lat, lng, date, method, madhab, timeFormat)]
  if (!entry) return null
  // Rehydrate serialised Date strings → Date objects
  const result = { ...entry.data }
  DATE_FIELDS.forEach(k => { if (result[k]) result[k] = new Date(result[k]) })

  // Sanity guard: never return times whose calendar day doesn't match the
  // requested day (defends against any key collision / stale entry). Forces a
  // fresh fetch instead of showing day-shifted times.
  if (result.fajrDate instanceof Date &&
      localDateStr(result.fajrDate) !== localDateStr(date)) {
    return null
  }
  return result
}

export function saveCache(lat, lng, date, method, madhab, timeFormat, data) {
  const cache = read()
  cache[makeKey(lat, lng, date, method, madhab, timeFormat)] = { data, savedAt: Date.now() }

  // Prune entries older than 8 days
  const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000
  for (const k of Object.keys(cache)) {
    if (cache[k].savedAt < cutoff) delete cache[k]
  }

  write(cache)
}
