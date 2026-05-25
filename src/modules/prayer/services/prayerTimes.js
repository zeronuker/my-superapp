import { fetchAladhan }   from './aladhanAPI'
import { calculateLocal }  from './adhanLocal'
import { getCached, saveCache } from './cache'

/**
 * Main orchestrator:
 *   1. Return cached times if available
 *   2. If online → try Aladhan API
 *   3. Fallback → calculate locally with adhan.js
 *   4. Pre-fetch next 6 days in the background when online
 */
export async function getPrayerTimes(lat, lng, date, method, madhab, timeFormat) {
  // 1. Cache first
  const cached = getCached(lat, lng, date, method, madhab, timeFormat)
  if (cached) return cached

  // 2. API (with fallback)
  if (navigator.onLine) {
    try {
      const times = await fetchAladhan(lat, lng, date, method, madhab, timeFormat)
      saveCache(lat, lng, date, method, madhab, timeFormat, times)
      // Fire-and-forget: pre-fetch next 6 days
      prefetchWindow(lat, lng, date, method, madhab, timeFormat)
      return times
    } catch {
      /* fall through to local calculation */
    }
  }

  // 3. Local calculation
  const times = calculateLocal(lat, lng, date, method, madhab, timeFormat)
  saveCache(lat, lng, date, method, madhab, timeFormat, times)
  return times
}

async function prefetchWindow(lat, lng, baseDate, method, madhab, timeFormat) {
  for (let i = 1; i <= 6; i++) {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + i)
    if (!getCached(lat, lng, d, method, madhab, timeFormat)) {
      try {
        const times = await fetchAladhan(lat, lng, d, method, madhab, timeFormat)
        saveCache(lat, lng, d, method, madhab, timeFormat, times)
      } catch { /* best effort */ }
    }
  }
}
