/**
 * Unified Vercel serverless proxy for every SkyLink API endpoint this app
 * uses — one function instead of one-per-endpoint. Vercel's Hobby plan caps
 * a deployment at 12 serverless functions total; ten separate SkyLink files
 * pushed the project over that limit as features were added, so they're
 * consolidated here behind a `resource` query param instead.
 *
 * GET /api/skylink?resource=<name>&...params
 *
 *   adsb                 — lat&lon&radius | icao24 | callsign   (live ADS-B positions; callsign
 *                           alone searches the whole global feed, no location needed)
 *   aircraft             — registration | icao24                (aircraft identity lookup)
 *   flight-status        — flight                               (schedule/route/delay by flight #)
 *   airlines             — icao | iata                          (airline name/IATA/ICAO/logo)
 *   aircraft-performance — icao_type                            (engine/speed/range/dimensions)
 *   metar                — icao                                 (raw METAR)
 *   taf                  — icao                                 (raw TAF)
 *   notam                — icao                                 (NOTAMs, FAA SWIM feed)
 *   arrivals             — icao                                 (arrival schedule board)
 *   departures           — icao                                 (departure schedule board)
 */
import { skylinkFetch, handleSkylinkError } from './_skylink.js'

// Each builder returns { path, params, timeoutMs, cacheControl, notFoundIsNull? } or throws
// an Error with a user-facing message for a missing/invalid param.
const RESOURCES = {
  adsb: ({ lat, lon, radius, icao24, callsign }) => {
    if (!icao24 && !callsign && (!lat || !lon)) {
      throw new Error('lat and lon (or icao24, or callsign) are required')
    }
    const params = {}
    if (icao24) params.icao24 = icao24
    if (callsign) params.callsign = callsign
    if (lat && lon) {
      params.lat = lat
      params.lon = lon
      // Our UI works in nautical miles; SkyLink's radius is kilometers.
      if (radius) params.radius = Math.round(Number(radius) * 1.852)
    }
    return { path: '/adsb/aircraft', params, timeoutMs: 10_000, cacheControl: 'no-store, no-cache' }
  },

  aircraft: ({ registration, icao24 }) => {
    if (!registration && !icao24) throw new Error('registration or icao24 query parameter is required')
    const path = registration
      ? `/aircraft/registration/${encodeURIComponent(registration.trim().toUpperCase())}`
      : `/aircraft/icao24/${encodeURIComponent(icao24.trim().toLowerCase())}`
    return { path, params: {}, timeoutMs: 8000, cacheControl: 'public, max-age=3600' }
  },

  'flight-status': ({ flight }) => {
    if (!flight) throw new Error('flight query parameter is required')
    return {
      path: `/flight_status/${encodeURIComponent(flight.trim())}`, params: {}, timeoutMs: 8000,
      cacheControl: 'no-store, no-cache',
      notFoundIsNull: true, // no scheduled flight matches this callsign — a normal outcome (GA/private traffic)
    }
  },

  airlines: ({ icao, iata }) => {
    if (!icao && !iata) throw new Error('icao or iata query parameter is required')
    const params = {}
    if (icao) params.icao = icao.trim().toUpperCase()
    if (iata) params.iata = iata.trim().toUpperCase()
    return { path: '/airlines/search', params, timeoutMs: 8000, cacheControl: 'public, max-age=86400' }
  },

  'aircraft-performance': ({ icao_type }) => {
    if (!icao_type) throw new Error('icao_type query parameter is required')
    return {
      path: `/aircraft/performance/${encodeURIComponent(icao_type.trim().toUpperCase())}`, params: {}, timeoutMs: 8000,
      cacheControl: 'public, max-age=86400',
    }
  },

  metar: ({ icao }) => {
    if (!icao) throw new Error('icao query parameter is required')
    return {
      path: `/weather/metar/${encodeURIComponent(icao.trim().toUpperCase())}`, params: { parsed: false }, timeoutMs: 8000,
      cacheControl: 'no-store, no-cache',
    }
  },

  taf: ({ icao }) => {
    if (!icao) throw new Error('icao query parameter is required')
    return {
      path: `/weather/taf/${encodeURIComponent(icao.trim().toUpperCase())}`, params: { parsed: false }, timeoutMs: 8000,
      cacheControl: 'no-store, no-cache',
    }
  },

  notam: ({ icao }) => {
    if (!icao) throw new Error('icao query parameter is required')
    return {
      path: `/notams/${encodeURIComponent(icao.trim().toUpperCase())}`, params: {}, timeoutMs: 15_000,
      cacheControl: 'no-store, no-cache',
    }
  },

  // date/time confirmed live against the RapidAPI console (11 Jul 2026):
  // date is DD-MM-YYYY, range 5 days back to 1 day forward; time is HH:MM and
  // acts as a start anchor (returns flights from that time onward), not an
  // exact match or a range — the upper bound of a range is applied client-side.
  arrivals: ({ icao, date, time }) => {
    if (!icao) throw new Error('icao query parameter is required')
    const params = { icao: icao.trim().toUpperCase() }
    if (date) params.date = date
    if (time) params.time = time
    return { path: '/schedules/arrivals', params, timeoutMs: 15_000, cacheControl: 'no-store, no-cache' }
  },

  departures: ({ icao, date, time }) => {
    if (!icao) throw new Error('icao query parameter is required')
    const params = { icao: icao.trim().toUpperCase() }
    if (date) params.date = date
    if (time) params.time = time
    return { path: '/schedules/departures', params, timeoutMs: 15_000, cacheControl: 'no-store, no-cache' }
  },
}

export default async function handler(req, res) {
  const { resource, ...query } = req.query
  const build = RESOURCES[resource]
  if (!build) {
    return res.status(400).json({ error: `Unknown or missing resource "${resource}" — expected one of ${Object.keys(RESOURCES).join(', ')}` })
  }

  let spec
  try {
    spec = build(query)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  try {
    const upstream = await skylinkFetch(spec.path, spec.params, spec.timeoutMs)
    if (spec.notFoundIsNull && upstream.status === 404) {
      res.setHeader('Cache-Control', spec.cacheControl)
      return res.status(200).json(null)
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: `SkyLink ${resource} error ${upstream.status}: ${text.slice(0, 200)}` })
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', spec.cacheControl)
    res.status(200).json(data)
  } catch (e) {
    handleSkylinkError(e, res)
  }
}
