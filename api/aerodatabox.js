/**
 * Vercel serverless proxy for AeroDataBox — used instead of SkyLink for the
 * two things SkyLink can't do: date-scoped flight status (SkyLink's
 * flight_status has no date param and was observed returning a stale
 * weeks-old record) and airport runway data (SkyLink has none at all).
 *
 * GET /api/aerodatabox?flight=<number>&date=<YYYY-MM-DD>   (flight status)
 * GET /api/aerodatabox?icao=<ICAO>                          (runways)
 * GET /api/aerodatabox?iata=<IATA>                          (runways)
 *
 * `date` is expected to be the caller's own local calendar date (the
 * frontend computes this from the device clock, not UTC) — a flight number
 * is a distinct flight per departure day, so this must match "today" as the
 * person searching understands it.
 *
 * Required Vercel environment variable:
 *   AERODATABOX_API_KEY — the X-RapidAPI-Key from
 *   rapidapi.com/aedbx-aedbx/api/aerodatabox
 */

const BASE = 'https://aerodatabox.p.rapidapi.com'
const HOST = 'aerodatabox.p.rapidapi.com'

function previousDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
// AeroDataBox's Basic plan is rate-limited to ~1 request/second. A
// registration search that doesn't match a flight number chains up to 4
// sequential calls (number today/yesterday, then reg today/yesterday) —
// fired back-to-back that tripped a 429 partway through in practice. This
// pace only kicks in between fallback attempts, not on the common one-call
// path, so a normal flight-number search isn't slowed down.
const AERODATABOX_MIN_INTERVAL_MS = 1100

// Fetches one date's matches for either search mode. Always returns an
// array — flight-number search normally has at most one match (a flight
// number is a distinct flight per departure day), registration search can
// return several (one aircraft can fly multiple sectors in a day).
async function fetchFlightsForDate(searchBy, param, dateStr, apiKey) {
  const params = new URLSearchParams({
    dateLocalRole: 'Departure', withAircraftImage: 'false', withFlightPlan: 'false', withLocation: 'true',
  })
  const upstream = await fetch(
    `${BASE}/flights/${searchBy}/${encodeURIComponent(param)}/${encodeURIComponent(dateStr)}?${params}`,
    { headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST }, signal: AbortSignal.timeout(8000) },
  )
  if (upstream.status === 204) return []
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    const err = new Error(`AeroDataBox error ${upstream.status}: ${text.slice(0, 200)}`)
    err.status = upstream.status
    throw err
  }
  const data = await upstream.json()
  return Array.isArray(data) ? data : (data ? [data] : [])
}

export default async function handler(req, res) {
  const { flight, date, icao, iata } = req.query
  const apiKey = process.env.AERODATABOX_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AERODATABOX_API_KEY is not configured' })

  if (flight) {
    if (!date) return res.status(400).json({ error: 'date query parameter is required' })
    const term = String(flight).trim()
    const dateStr = String(date).trim()
    try {
      // The search box accepts either a flight number or an aircraft
      // registration, with no reliable way to tell which just by looking at
      // the string in general (some registrations, like US N-numbers, don't
      // have a hyphen). One narrower signal IS safe though: a real flight
      // number never contains a hyphen, so if the input has one, it can't be
      // a flight number — skip straight to registration search instead of
      // burning two guaranteed-to-fail number-search calls first. Absent a
      // hyphen, still don't guess: try flight number first (the common
      // case), fall back to registration only on a miss. Each mode also
      // falls back exactly one day, to catch an overnight flight that
      // departed yesterday and is still en route (or has since landed).
      // Never further back than that, and never mixes the two search modes
      // within a single date pass.
      const looksLikeRegistration = term.includes('-')
      let matchedBy = looksLikeRegistration ? 'reg' : 'number'
      let flights = await fetchFlightsForDate(matchedBy, term, dateStr, apiKey)
      if (!flights.length) {
        await sleep(AERODATABOX_MIN_INTERVAL_MS)
        flights = await fetchFlightsForDate(matchedBy, term, previousDate(dateStr), apiKey)
      }
      if (!flights.length && !looksLikeRegistration) {
        matchedBy = 'reg'
        await sleep(AERODATABOX_MIN_INTERVAL_MS)
        flights = await fetchFlightsForDate('reg', term, dateStr, apiKey)
        if (!flights.length) {
          await sleep(AERODATABOX_MIN_INTERVAL_MS)
          flights = await fetchFlightsForDate('reg', term, previousDate(dateStr), apiKey)
        }
      }
      res.setHeader('Cache-Control', 'no-store, no-cache')
      return res.status(200).json({ matchedBy, flights })
    } catch (e) {
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      return res.status(isTimeout ? 504 : (e.status || 502)).json({ error: isTimeout ? 'AeroDataBox API timed out' : e.message })
    }
  }

  if (icao || iata) {
    const codeType = icao ? 'icao' : 'iata'
    const code = String(icao || iata).trim().toUpperCase()
    if (!code) return res.status(400).json({ error: 'icao/iata query parameter is required' })
    try {
      const upstream = await fetch(`${BASE}/airports/${codeType}/${encodeURIComponent(code)}/runways`, {
        headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST },
        signal: AbortSignal.timeout(8000),
      })
      if (upstream.status === 204) {
        // Don't apply the week-long runway cache to an empty/absent result —
        // a transient upstream gap shouldn't get stuck cached as "no data".
        res.setHeader('Cache-Control', 'no-store, no-cache')
        return res.status(200).json([])
      }
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '')
        return res.status(upstream.status).json({ error: `AeroDataBox error ${upstream.status}: ${text.slice(0, 200)}` })
      }
      const data = await upstream.json()
      // Runway layouts change rarely — cache a week to stay well within the free tier.
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000')
      return res.status(200).json(data)
    } catch (e) {
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'AeroDataBox API timed out' : String(e) })
    }
  }

  return res.status(400).json({ error: 'flight+date, or icao/iata, query parameters are required' })
}
