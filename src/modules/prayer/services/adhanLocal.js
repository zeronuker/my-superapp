import { Coordinates, Madhab, PrayerTimes } from 'adhan'
import { METHODS, resolveMethodId } from './methods'
import { formatInZone } from './zonedTime'

/**
 * Calculate prayer times locally using adhan.js.
 * `method` is a settings value or a method id (see methods.js; resolve 'auto'
 * to an id first). `tz` is the location's IANA time zone — the clock strings
 * are shown in it; omit it to use the device's zone.
 * Returns normalized times object with both formatted strings and raw Date objects.
 */
export function calculateLocal(lat, lng, date, method = 17, madhab = 'shafi', timeFormat = '24hr', tz) {
  const methodId = resolveMethodId(method)
  const coords  = new Coordinates(lat, lng)
  const params  = METHODS[methodId].params()
  params.madhab = madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi

  const pt = new PrayerTimes(coords, date, params)
  const fmt = (d) => formatInZone(d, tz, timeFormat)

  // Imsak: 10 minutes before Fajr (JAKIM standard; universally used across methods)
  const imsakDate = new Date(pt.fajr.getTime() - 10 * 60_000)

  return {
    Imsak:   fmt(imsakDate),
    Fajr:    fmt(pt.fajr),
    Sunrise: fmt(pt.sunrise),
    Dhuhr:   fmt(pt.dhuhr),
    Asr:     fmt(pt.asr),
    Maghrib: fmt(pt.maghrib),
    Isha:    fmt(pt.isha),
    // Raw Date objects for countdown / next-prayer logic
    imsakDate,
    fajrDate:    pt.fajr,
    sunriseDate: pt.sunrise,
    dhuhrDate:   pt.dhuhr,
    asrDate:     pt.asr,
    maghribDate: pt.maghrib,
    ishaDate:    pt.isha,
    source: 'local',
    date:   date.toDateString(),
    methodId,
    timeZone: tz,
  }
}
