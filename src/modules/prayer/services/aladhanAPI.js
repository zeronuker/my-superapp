// Aladhan.com REST API — free, no API key required
// Docs: https://aladhan.com/prayer-times-api

// Method numbers as defined by Aladhan API
// JAKIM uses Fajr 20°, Isha 18° — map to method=99 (custom) with methodSettings
const ALADHAN_METHOD = {
  jakim:        { method: 99, methodSettings: '20,null,18' },
  moonsighting: { method: 15 },
  mwl:          { method: 3  },
  isna:         { method: 2  },
  egyptian:     { method: 5  },
  uaq:          { method: 4  },
}

function toDate(timeStr, baseDate) {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(baseDate)
  d.setHours(h, m, 0, 0)
  return d
}

function fmt(timeStr, baseDate, timeFormat) {
  if (timeFormat === '12hr') {
    const d = toDate(timeStr, baseDate)
    const h = d.getHours()
    const m = String(d.getMinutes()).padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${m} ${ampm}`
  }
  return timeStr.substring(0, 5)  // already "HH:MM" from API
}

/**
 * Fetch prayer times from Aladhan.com API.
 * Throws on network error or non-2xx response — caller handles fallback.
 */
export async function fetchAladhan(lat, lng, date, method = 'jakim', madhab = 'shafi', timeFormat = '24hr') {
  const timestamp = Math.floor(date.getTime() / 1000)
  const m = ALADHAN_METHOD[method] ?? ALADHAN_METHOD.jakim
  const school = madhab === 'hanafi' ? 1 : 0

  let url = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lng}&method=${m.method}&school=${school}`
  if (m.methodSettings) url += `&methodSettings=${encodeURIComponent(m.methodSettings)}`

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Aladhan ${res.status}`)

  const json = await res.json()
  if (json.code !== 200) throw new Error(`Aladhan error: ${json.status}`)

  const t = json.data.timings

  return {
    Imsak:   fmt(t.Imsak,   date, timeFormat),
    Fajr:    fmt(t.Fajr,    date, timeFormat),
    Sunrise: fmt(t.Sunrise, date, timeFormat),
    Dhuhr:   fmt(t.Dhuhr,   date, timeFormat),
    Asr:     fmt(t.Asr,     date, timeFormat),
    Maghrib: fmt(t.Maghrib, date, timeFormat),
    Isha:    fmt(t.Isha,    date, timeFormat),
    // Raw Date objects
    imsakDate:   toDate(t.Imsak,   date),
    fajrDate:    toDate(t.Fajr,    date),
    sunriseDate: toDate(t.Sunrise, date),
    dhuhrDate:   toDate(t.Dhuhr,   date),
    asrDate:     toDate(t.Asr,     date),
    maghribDate: toDate(t.Maghrib, date),
    ishaDate:    toDate(t.Isha,    date),
    source: 'api',
    date:   date.toDateString(),
  }
}
