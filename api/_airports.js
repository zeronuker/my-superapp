// Melbourne, Sydney, Perth and Brisbane, translated into the same flight shape
// api/gatefinder.js returns for Malaysia Airports, so one FlightCard shows all
// of them. Melbourne and Sydney are the keyless endpoints their own websites
// call (no docs, no promises): Melbourne's list carries the gate, Sydney's does
// not, so Sydney gates come from one detail call per flight we actually return.
// Perth and Brisbane block server requests, so they come from aviationstack's
// free plan instead: one request per flight number, today only, ~100 a month.

const MEL_URL = 'https://www.melbourneairport.com.au/api/data/search'
const SYD_URL = 'https://www.sydneyairport.com.au/_a/flights'
const AVS_URL = 'https://api.aviationstack.com/v1/flights'
const TZ = {
  MEL: 'Australia/Melbourne', SYD: 'Australia/Sydney',
  PER: 'Australia/Perth', BNE: 'Australia/Brisbane',
}
const TAKE = 25
const FINISHED = /^(departed|arrived|landed|cancelled)$/i
const AVS_STATUS = {
  scheduled: 'SCHEDULED', active: 'AIRBORNE', landed: 'LANDED',
  cancelled: 'CANCELLED', incident: 'INCIDENT', diverted: 'DIVERTED',
}
const AVS_TERMINAL = { BNE: { D: 'Domestic', I: 'International' } }
const AVS_CACHE_MS = 10 * 60_000

const squash = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase()
const spaced = (n) => String(n ?? '').replace(/^([A-Z0-9]{2})(\d)/, '$1 $2')
const codeOf = (n) => /^([A-Z0-9]{2})/.exec(n)?.[1] ?? ''

// Only the gate's own lifecycle words count; "CHECK IN OPEN" is not a gate state.
const gateStatus = (s) => /^(?:gate )?(open|closed|boarding|final call)$/i.exec(String(s ?? '').trim())?.[1].toUpperCase() ?? ''

// 'YYYY-MM-DDTHH:mm' on the wall clock of `tz`.
function localIso(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(ms).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

// The airport-local day `dayKey` days from today. `from`/`to` are a padded UTC
// window (local midnight sits 10-11 h before UTC midnight for these two
// zones) that Melbourne's timestamp filter needs; `date` / `notBefore` are what
// the flights are actually trimmed to. Today starts an hour ago, so a search
// with no query shows what is about to go rather than 25 flights already gone.
export function dayWindow(tz, dayKey, now = Date.now()) {
  const base = Date.parse(`${localIso(now, tz).slice(0, 10)}T00:00:00Z`) + dayKey * 86_400_000
  const date = new Date(base).toISOString().slice(0, 10)
  return {
    date, from: base - 12 * 3_600_000, to: base + 14 * 3_600_000,
    notBefore: dayKey === 0 ? localIso(now - 3_600_000, tz) : `${date}T00:00`,
  }
}

const codeshare = (n, names) => ({
  afsKey: n, flightNumber: spaced(n), airlineCode: codeOf(n), airline: { name: names[codeOf(n)] },
})
const nameMap = (pairs) => Object.fromEntries(pairs.filter(([c, n]) => c && n).map(([c, n]) => [c, String(n).trim().toUpperCase()]))

export function fromMelbourne(hits) {
  const names = nameMap(hits.map(h => [h.airlineCode, h.airlineName]))
  return hits.map(h => {
    const arr = h.flightDirection === 'arrival'
    const a = h.airports?.[0]
    return {
      afsKey: h.id, flightNumber: spaced(h.flightNumber), status: h.status, leg: arr ? 'A' : 'D',
      category: h.routeType === 'international' ? 'I' : 'D',
      name: (names[h.airlineCode] || h.airlineCode), aircraftOperator: h.airlineCode,
      [arr ? 'origin' : 'destination']: { city: a ? `${a.name.toUpperCase()}(${a.code})` : '' },
      terminal: h.terminal, gate: { name: h.gate, status: gateStatus(h.status) },
      checkIn: { counters: h.checkInCounter }, scheduledTime: h.scheduledDateTime,
      codeShareFlights: (h.flightCodeshares || []).map(c => codeshare(c.flightNumber, names)),
    }
  })
}

// `detail` is the per-flight reply (gate and check-in live there); without it
// the flight has no gate yet.
export function fromSydney(i, names, detail) {
  const arr = i.flightType === 'ARRIVAL'
  const field = (n) => {
    const v = detail?.flightDetails?.find(d => d.fieldName === n)?.fieldValue
    return !v || v === '--' ? '' : v
  }
  const [main, ...rest] = i.flightNumbers
  return {
    afsKey: i.id, flightNumber: spaced(main), status: i.status, leg: arr ? 'A' : 'D',
    category: i.terminalType === 'INTERNATIONAL' ? 'I' : 'D',
    name: names[i.airlineCode] || i.airlineCode, aircraftOperator: i.airlineCode,
    [arr ? 'origin' : 'destination']: { city: String(i.destinations?.[0] ?? '').trim().toUpperCase() },
    terminal: i.terminalNumber, gate: { name: field('Gate'), status: gateStatus(i.status) },
    checkIn: { counters: field('Check-In') }, scheduledTime: `${i.scheduledDate}T${i.scheduledTime}`,
    codeShareFlights: rest.map(n => codeshare(n, names)),
  }
}

function matches(f, key, value) {
  const q = squash(value)
  if (key === 'all' || !q) return true
  if (key === 'flight') return [f.flightNumber, ...f.codeShareFlights.map(c => c.flightNumber)].some(n => squash(n).includes(q))
  if (key === 'city') return squash((f.leg === 'A' ? f.origin : f.destination).city).includes(q)
  return squash(f.name).includes(q) || f.aircraftOperator === q
}

// The day's flights trimmed to the window, matching the search, earliest first.
export function pick(flights, w, key, value) {
  return flights
    .filter(f => f.scheduledTime.slice(0, 10) === w.date && f.scheduledTime.slice(0, 16) >= w.notBefore)
    .filter(f => matches(f, key, value))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
    .slice(0, TAKE)
}

const getJson = async (url, ms) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
  return { ok: r.ok, body: await r.json().catch(() => null) }
}

export async function fetchMelbourne({ code, dayKey, key, value, now = Date.now() }) {
  const w = dayWindow(TZ.MEL, dayKey, now)
  const params = new URLSearchParams({
    'queries[flights][query]': '', 'queries[flights][limit]': '500', 'queries[flights][offset]': '0',
    'queries[flights][locale]': 'en',
    'queries[flights][filters]': `flightDirection:${code === 'A' ? 'arrival' : 'departure'} AND scheduledTimeStamp: ${w.from} TO ${w.to}`,
  })
  const { ok, body } = await getJson(`${MEL_URL}?${params}`, 8000)
  const hits = body?.data?.flights?.hits
  if (!ok || !Array.isArray(hits)) throw new Error('Melbourne Airport data unavailable')
  return pick(fromMelbourne(hits), w, key, value)
}

export async function fetchSydney({ code, dayKey, key, value, now = Date.now() }) {
  const w = dayWindow(TZ.SYD, dayKey, now)
  const lists = await Promise.all(['domestic', 'international'].map(async terminalType => {
    const params = new URLSearchParams({
      flightType: code === 'A' ? 'arrival' : 'departure', terminalType, filter: '', date: w.date,
      count: '500', startFrom: '0', seq: '1', sortColumn: 'scheduled_time', ascending: 'true', showAll: 'false',
    })
    const { ok, body } = await getJson(`${SYD_URL}?${params}`, 8000)
    if (!ok || !Array.isArray(body?.flightData)) throw new Error('Sydney Airport data unavailable')
    return body.flightData
  }))
  const items = lists.flat()
  const names = nameMap(items.map(i => [i.airlineCode, i.airline]))
  const byId = new Map(items.map(i => [i.id, i]))
  const picked = pick(items.map(i => fromSydney(i, names)), w, key, value)

  // A finished flight has no gate to show, so skip its detail call. A detail
  // call that fails just leaves that flight's gate blank.
  return Promise.all(picked.map(async f => {
    const i = byId.get(f.afsKey)
    if (FINISHED.test(i.status)) return f
    const url = `${SYD_URL}/${encodeURIComponent(i.flightNumbers[0])}/${encodeURIComponent(i.id)}/${i.flightType === 'ARRIVAL' ? 'picking-up' : 'departing'}`
    const detail = await getJson(url, 6000).then(r => (r.ok ? r.body : null), () => null)
    return fromSydney(i, names, detail)
  }))
}

// aviationstack lists every codeshare partner as its own record next to the
// operating flight's, all with the same gate; fold them back into one flight.
// Its times are airport-local wall clock labelled "+00:00", so the label is
// dropped. `airport` is the one we asked about, `code` D or A picks its side.
export function fromAviationstack(records, airport, code, now = Date.now()) {
  const side = code === 'A' ? 'arrival' : 'departure'
  const other = code === 'A' ? 'departure' : 'arrival'
  const today = dayWindow(TZ[airport], 0, now).date
  const groups = new Map()
  for (const r of records) {
    if (r[side]?.iata !== airport || r[side].scheduled?.slice(0, 10) !== today) continue
    const main = (r.flight.codeshared?.flight_iata ?? r.flight.iata).toUpperCase()
    const k = `${main}|${r[side].scheduled}`
    groups.set(k, [...(groups.get(k) ?? []), { r, main }])
  }
  return [...groups].map(([k, rs]) => {
    const op = rs.find(x => !x.r.flight.codeshared)?.r
    const { r, main } = rs[0]
    const s = r[side]
    const o = r[other]
    return {
      afsKey: k, flightNumber: spaced(main), status: AVS_STATUS[r.flight_status] ?? String(r.flight_status ?? '').toUpperCase(),
      leg: code === 'A' ? 'A' : 'D',
      name: String(op ? op.airline?.name : r.flight.codeshared.airline_name).toUpperCase(),
      aircraftOperator: codeOf(main),
      [other === 'arrival' ? 'destination' : 'origin']: { city: `${String(o.airport ?? '').replace(/\s*(international\s+)?airport$|\s+international$/i, '').toUpperCase()}(${o.iata})` },
      terminal: AVS_TERMINAL[airport]?.[s.terminal] ?? s.terminal ?? '',
      gate: { name: s.gate ?? '', status: '' }, checkIn: { counters: '' },
      scheduledTime: s.scheduled.slice(0, 19),
      codeShareFlights: rs.filter(x => x.r.flight.codeshared).map(x => codeshare(x.r.flight.iata.toUpperCase(), { [codeOf(x.r.flight.iata.toUpperCase())]: String(x.r.airline?.name ?? '').toUpperCase() })),
    }
  })
}

const fail = (status, message) => Object.assign(new Error(message), { status })
const avsCache = new Map()

// Flight-number search only: that is what costs one of the plan's ~100
// monthly requests. Identical searches within ten minutes reuse the answer.
export async function fetchAviationstack({ terminal, code, dayKey, key, value, now = Date.now(), apiKey = process.env.AVIATIONSTACK_API_KEY }) {
  const flight = squash(value)
  if (key !== 'flight' || !/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(flight)) throw fail(400, 'Enter a flight number, e.g. VA556')
  if (Number(dayKey) !== 0) throw fail(400, 'Perth and Brisbane only show today')
  const cacheKey = `${terminal}|${code}|${flight}|${dayWindow(TZ[terminal], 0, now).date}`
  const hit = avsCache.get(cacheKey)
  if (hit && now - hit.at < AVS_CACHE_MS) return hit.flights
  if (!apiKey) throw fail(503, 'Perth and Brisbane lookups are not set up')

  const params = new URLSearchParams({ access_key: apiKey, flight_iata: flight, [code === 'A' ? 'arr_iata' : 'dep_iata']: terminal })
  const { body } = await getJson(`${AVS_URL}?${params}`, 8000)
  // rate_limit_reached is a short throttle; the others mean the plan's allowance is used up.
  const errCode = body?.error?.code
  if (errCode === 'rate_limit_reached') throw fail(429, 'Too many lookups just now, try again in a minute')
  if (/^(usage|daily_usage|fair_use)_limit_reached$/.test(errCode)) throw fail(429, 'Perth/Brisbane lookup limit reached, try again later')
  if (!Array.isArray(body?.data)) throw fail(502, 'Perth/Brisbane data unavailable')

  const flights = fromAviationstack(body.data, terminal, code, now)
  if (avsCache.size > 200) avsCache.clear()
  avsCache.set(cacheKey, { at: now, flights })
  return flights
}

const BOARDS = { MEL: fetchMelbourne, SYD: fetchSydney, PER: fetchAviationstack, BNE: fetchAviationstack }
export const AU_AIRPORTS = new Set(Object.keys(BOARDS))
export const fetchAuAirport = (args) => BOARDS[args.terminal](args)
