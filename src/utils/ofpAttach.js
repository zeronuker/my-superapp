// Adding an OFP to a briefing that is already saved. Pure — no React, no stores.
//
// Only two things of a save change: its Flight Details (route.flightDetails) and the route's positioned
// waypoints (route.routeText as NAME:lat:lon tokens, data.routeFixes), which the map picture is redrawn from.
// Everything else — name, airports, alternates, FIRs, weather, NOTAMs, SIGMETs, Satellite pictures — stays
// exactly as it was saved, so the OFP's own alternates and FIRs are ignored here.

import { parseRoute } from './routeParse'

// What the Flight Details tab reads: ofpToFields' `details` plus the flight, the info and the airports' time zones.
export const flightDetailsFrom = (f, depTz = null, arrTz = null) =>
  ({ ...f.details, flight: f.flight, info: f.info, depTz, arrTz })

// The OFP's positioned waypoints, or null when it has none (then the map keeps its old route).
export const ofpWaypoints = (f) => parseRoute(f.routeText).pts

// Words for the "this OFP is for another flight" warning, or null when the airports agree.
export function ofpMismatch(route, f) {
  if (f.dep === route.dep && f.arr === route.arr) return null
  return `This OFP is ${f.dep} → ${f.arr}, but this briefing is ${route.dep} → ${route.arr}.`
}

// The save's route and data with the OFP put in; everything else in them is the same object as before.
export function applyOfp(save, f, flightDetails) {
  const pts = ofpWaypoints(f)
  const route = { ...save.route, flightDetails, ...(pts ? { routeText: f.routeText } : {}) }
  const { routeError: _gone, ...rest } = save.data ?? {}
  const data = pts ? { ...rest, routeFixes: pts } : save.data
  return { route, data }
}
