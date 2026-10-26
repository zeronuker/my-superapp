import { rateLimited } from './_rateLimit.js'
import { AU_AIRPORTS, fetchAuAirport } from './_airports.js'

// Malaysia Airports flight-status search — same endpoint their own
// flight-information pages call from the browser. The API key below is the
// literal fallback baked into Malaysia Airports' own public production JS
// bundle (no env var set on their end), so it isn't a secret — but the call
// is proxied server-side anyway to avoid CORS and keep the key out of our
// client bundle.
const BASE = 'https://api.myairports.com.my/passenger-fids/api'
const API_KEY = process.env.GATEFINDER_API_KEY || 'f02f252a781a4db584d1ae9fce22bed1'

// MEL, SYD, PER and BNE are not Malaysia Airports' own: api/_airports.js answers
// them in the same flight shape (airport websites, or aviationstack for PER and
// BNE). One function for all of them, because the project is at Vercel's cap.
const TERMINALS = new Set(['KLIA', 'KLIA2', 'BKI', 'KCH', 'LGK', 'PEN', ...AU_AIRPORTS])
const CRITERIA = new Set(['all', 'flight', 'city', 'airline'])

export default async function handler(req, res) {
  if (rateLimited(req, res)) return

  const { code, terminal, dayKey, key = 'all', value = '' } = req.query

  if (!['D', 'A'].includes(code)) {
    return res.status(400).json({ error: 'code must be D (departures) or A (arrivals)' })
  }
  if (!TERMINALS.has(terminal)) {
    return res.status(400).json({ error: `terminal must be one of ${[...TERMINALS].join(', ')}` })
  }
  if (!['-1', '0', '1'].includes(String(dayKey))) {
    return res.status(400).json({ error: 'dayKey must be -1 (yesterday), 0 (today), or 1 (tomorrow)' })
  }
  if (!CRITERIA.has(key)) {
    return res.status(400).json({ error: `key must be one of ${[...CRITERIA].join(', ')}` })
  }

  const params = new URLSearchParams({
    code, terminal, dayKey: String(dayKey), key, value: String(value),
    skip: '0', take: '25',
  })

  try {
    if (AU_AIRPORTS.has(terminal)) {
      const flightStatuses = await fetchAuAirport({ terminal, code, dayKey: Number(dayKey), key, value: String(value) })
      res.setHeader('Cache-Control', 'no-store, no-cache')
      return res.status(200).json({ flightStatuses })
    }
    const upstream = await fetch(`${BASE}/flights/search-flights?${params}`, {
      headers: { 'x-api-key': API_KEY },
      signal: AbortSignal.timeout(8000),
    })
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(upstream.ok ? 200 : 502).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    res.status(e?.status || (isTimeout ? 504 : 502)).json({ error: isTimeout ? 'Gate Finder API timed out' : (e?.message || String(e)) })
  }
}
