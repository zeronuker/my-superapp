// localStorage cache for prayer times — 7-day rolling window
const CACHE_KEY = 'prayer-module-cache'

function read() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') } catch { return {} }
}

function write(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* storage full */ }
}

function makeKey(lat, lng, date, method, madhab, timeFormat) {
  return `${date.toISOString().slice(0, 10)}|${lat.toFixed(3)}|${lng.toFixed(3)}|${method}|${madhab}|${timeFormat}`
}

const DATE_FIELDS = ['imsakDate', 'fajrDate', 'sunriseDate', 'dhuhrDate', 'asrDate', 'maghribDate', 'ishaDate']

export function getCached(lat, lng, date, method, madhab, timeFormat) {
  const cache = read()
  const entry = cache[makeKey(lat, lng, date, method, madhab, timeFormat)]
  if (!entry) return null
  // Rehydrate serialised Date strings → Date objects
  const result = { ...entry.data }
  DATE_FIELDS.forEach(k => { if (result[k]) result[k] = new Date(result[k]) })
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
