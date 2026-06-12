import {
  Coordinates,
  CalculationMethod,
  CalculationParameters,
  Madhab,
  PrayerTimes,
} from 'adhan'

// Minutes after sunrise that Dhuha (sunnah) begins. Adjust to taste / authority.
const DHUHA_OFFSET_MIN = 15

// ── Calculation method map ────────────────────────────────────────────────────
// JAKIM uses Fajr 20°, Isha 18° — not a named method in adhan.js, so custom
const METHOD_MAP = {
  jakim:        () => new CalculationParameters('Other', 20, 18),
  moonsighting: () => CalculationMethod.MoonsightingCommittee(),
  mwl:          () => CalculationMethod.MuslimWorldLeague(),
  isna:         () => CalculationMethod.NorthAmerica(),
  egyptian:     () => CalculationMethod.Egyptian(),
  uaq:          () => CalculationMethod.UmmAlQura(),
}

function fmt(date, timeFormat) {
  if (!date) return '--:--'
  const h = date.getHours()
  const m = String(date.getMinutes()).padStart(2, '0')
  if (timeFormat === '12hr') {
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${m} ${ampm}`
  }
  return `${String(h).padStart(2, '0')}:${m}`
}

/**
 * Calculate prayer times locally using adhan.js.
 * Returns normalized times object with both formatted strings and raw Date objects.
 */
export function calculateLocal(lat, lng, date, method = 'jakim', madhab = 'shafi', timeFormat = '24hr') {
  const coords  = new Coordinates(lat, lng)
  const params  = (METHOD_MAP[method] ?? METHOD_MAP.jakim)()
  params.madhab = madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi

  const pt = new PrayerTimes(coords, date, params)

  // Imsak: 10 minutes before Fajr (JAKIM standard; universally used across methods)
  const imsakDate = new Date(pt.fajr.getTime() - 10 * 60_000)
  // Dhuha (sunnah): begins ~15 min after sunrise (sun ~spear's height above horizon)
  const dhuhaDate = new Date(pt.sunrise.getTime() + DHUHA_OFFSET_MIN * 60_000)

  return {
    Imsak:   fmt(imsakDate, timeFormat),
    Fajr:    fmt(pt.fajr,    timeFormat),
    Sunrise: fmt(pt.sunrise, timeFormat),
    Dhuha:   fmt(dhuhaDate, timeFormat),
    Dhuhr:   fmt(pt.dhuhr,  timeFormat),
    Asr:     fmt(pt.asr,    timeFormat),
    Maghrib: fmt(pt.maghrib, timeFormat),
    Isha:    fmt(pt.isha,   timeFormat),
    // Raw Date objects for countdown / next-prayer logic
    imsakDate,
    fajrDate:    pt.fajr,
    sunriseDate: pt.sunrise,
    dhuhaDate,
    dhuhrDate:   pt.dhuhr,
    asrDate:     pt.asr,
    maghribDate: pt.maghrib,
    ishaDate:    pt.isha,
    source: 'local',
    date:   date.toDateString(),
  }
}
