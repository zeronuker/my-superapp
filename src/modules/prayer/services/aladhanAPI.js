// Aladhan.com REST API — free, no API key required
// Docs: https://aladhan.com/prayer-times-api
import { METHOD_ID } from './methods'
import { zonedDate, fmtClock } from './zonedTime'

// "05:39" or "05:39 (+08)" → "05:39"
const hhmm = (s) => /\d{1,2}:\d{2}/.exec(s)[0]

// Aladhan's "DD-MM-YYYY" → "YYYY-MM-DD"
const isoDay = (ddmmyyyy) => ddmmyyyy.split('-').reverse().join('-')

/**
 * Fetch prayer times from Aladhan.com API.
 * `method` 'auto' leaves the method out so Aladhan picks the local authority's
 * from the coordinates; the id it used comes back as `methodId`.
 * Throws on network error or non-2xx response — caller handles fallback.
 */
export async function fetchAladhan(lat, lng, date, method = 'auto', madhab = 'shafi', timeFormat = '24hr') {
  const timestamp = Math.floor(date.getTime() / 1000)
  const school = madhab === 'hanafi' ? 1 : 0

  let url = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lng}&school=${school}`
  if (method !== 'auto') url += `&method=${METHOD_ID[method] ?? METHOD_ID.mwl}`

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Aladhan ${res.status}`)

  const json = await res.json()
  if (json.code !== 200) throw new Error(`Aladhan error: ${json.status}`)

  const { timings: t, meta } = json.data
  const tz = meta.timezone
  // The calendar day in the LOCATION, which can differ from the device's day.
  const day = isoDay(json.data.date.gregorian.date)
  const at = (s) => zonedDate(day, hhmm(s), tz)
  const clock = (s) => {
    const [h, m] = hhmm(s).split(':').map(Number)
    return fmtClock(h, m, timeFormat)
  }

  return {
    Imsak:   clock(t.Imsak),
    Fajr:    clock(t.Fajr),
    Sunrise: clock(t.Sunrise),
    Dhuhr:   clock(t.Dhuhr),
    Asr:     clock(t.Asr),
    Maghrib: clock(t.Maghrib),
    Isha:    clock(t.Isha),
    // Raw Date objects
    imsakDate:   at(t.Imsak),
    fajrDate:    at(t.Fajr),
    sunriseDate: at(t.Sunrise),
    dhuhrDate:   at(t.Dhuhr),
    asrDate:     at(t.Asr),
    maghribDate: at(t.Maghrib),
    ishaDate:    at(t.Isha),
    source: 'api',
    date:   date.toDateString(),
    methodId: meta.method.id,
    timeZone: tz,
  }
}
