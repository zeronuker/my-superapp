// METAR/TAF weather service — extracted from METARTAFCalculator.jsx so
// BriefingView can fetch the same data the same way, without duplicating
// the source-fallback logic.

import { skylinkMetarToAWCShape, skylinkTafToAWCShape } from '../utils/skylinkWeather'
import { isSkyLinkDay } from '../utils/sourceSwitch'

async function fetchOneAWC(icao, type, hours) {
  const r = await fetch(`/api/weather?ids=${icao}&type=${type}&hours=${hours}`)
  if (!r.ok) throw new Error(`${type.toUpperCase()} request failed`)
  return r.json()
}
async function fetchOneSkylinkWeather(icao, type) {
  const r = await fetch(`/api/skylink?resource=${type}&icao=${icao}`)
  if (!r.ok) throw new Error(`SkyLink ${type.toUpperCase()} request failed`)
  const raw = await r.json().catch(() => null)
  const shaped = type === 'metar' ? skylinkMetarToAWCShape(raw) : skylinkTafToAWCShape(raw)
  return shaped ? [shaped] : []
}

const WEATHER_FETCHERS = { aviationweather: fetchOneAWC, skylink: fetchOneSkylinkWeather }

// UTC even/odd day picks the source (see utils/sourceSwitch). METAR and TAF
// retry independently — if only one of the two fails on the scheduled
// source, just that one falls back to the other rather than both, and a
// type that fails on both sources degrades to an empty report instead of
// failing the whole airport.
export async function fetchWeather(icao, hours) {
  const preferSkylink = isSkyLinkDay()
  const primary = preferSkylink ? 'skylink' : 'aviationweather'
  const backup  = preferSkylink ? 'aviationweather' : 'skylink'

  const fetchType = async (type) => {
    try {
      return { data: await WEATHER_FETCHERS[primary](icao, type, hours), source: primary }
    } catch (e) {
      try {
        return { data: await WEATHER_FETCHERS[backup](icao, type, hours), source: backup }
      } catch (e2) {
        return { data: [], source: primary }
      }
    }
  }

  const [metarR, tafR] = await Promise.all([fetchType('metar'), fetchType('taf')])
  return { metar: metarR.data, taf: tafR.data, metarSource: metarR.source, tafSource: tafR.source }
}
