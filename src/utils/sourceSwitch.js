// Shared even/odd-day source picker for the METAR/TAF and NOTAM modules —
// both flip together, keyed off the UTC calendar date so it's consistent
// for every user regardless of local timezone. Even days prefer SkyLink,
// odd days prefer the existing source (aviationweather.gov / autorouter.aero).
export function isSkyLinkDay(date = new Date()) {
  return date.getUTCDate() % 2 === 0
}
