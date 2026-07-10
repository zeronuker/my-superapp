// Normalizes SkyLink's arrival/departure schedule responses. Shape confirmed
// live against WMKK for both directions (RapidAPI console + production,
// 10 Jul 2026) — each flight is { Time, Date, IATA, Origin|Destination,
// Flight, Airline, Status }, the same split-date-string / free-text-status
// shape already handled for flight status, so this reuses fmtLocalTime and
// statusColorFor from utils/traffic.js instead of duplicating that logic.
import { fmtLocalTime, statusColorFor } from './traffic'

export function normalizeScheduleFlight(raw, direction) {
  return {
    time: fmtLocalTime(raw.Time, raw.Date),
    flight: raw.Flight || '—',
    airline: raw.Airline || null,
    place: (direction === 'arrivals' ? raw.Origin : raw.Destination) || null,
    placeIata: raw.IATA || null,
    status: raw.Status ? raw.Status.toUpperCase() : null,
    statusColor: statusColorFor(raw.Status),
  }
}

export function normalizeSchedule(raw, direction) {
  const flights = Array.isArray(raw?.flights) ? raw.flights : []
  return flights.map(f => normalizeScheduleFlight(f, direction))
}
