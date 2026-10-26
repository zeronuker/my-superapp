import { describe, it, expect, vi, afterEach } from 'vitest'
import { dayWindow, fromMelbourne, fromSydney, pick, fetchMelbourne, fetchSydney, fromAviationstack, fetchAviationstack, fetchAuAirport } from './_airports.js'

// Trimmed copies of real replies (26 Oct 2026).
const melHit = (o = {}) => ({
  id: '21483*48600*TG462*YMML', flightNumber: 'TG462', airlineCode: 'TG', airlineName: 'Thai Airways',
  airports: [{ code: 'BKK', name: 'Bangkok' }], flightDirection: 'departure', gate: '5',
  routeType: 'international', status: 'BOARDING', terminal: 'T2', checkInCounter: 'Q',
  flightCodeshares: [{ flightNumber: 'WY5907', airlineCode: 'WY' }, { flightNumber: 'TK8005', airlineCode: 'TK' }],
  scheduledDateTime: '2026-10-26T00:30:00.000', ...o,
})
const sydItem = (o = {}) => ({
  id: 'cB8F0d7yy0QADpqMZDe6', airline: 'Qantas', airlineCode: 'QF', destinations: ['Melbourne'],
  flightNumbers: ['QF499', 'EK5358', 'NZ1899'], terminalType: 'DOMESTIC', terminalNumber: 'T3',
  flightType: 'DEPARTURE', scheduledTime: '22:00', scheduledDate: '2026-10-26', status: 'Gate Open', ...o,
})
const sydDetail = {
  flightDetails: [
    { fieldName: 'Check-In', fieldValue: '--' }, { fieldName: 'Terminal', fieldValue: 'T3' },
    { fieldName: 'Gate', fieldValue: 'Q1C' }, { fieldName: 'Boards', fieldValue: '11:36' },
  ],
}
const reply = (body, ok = true) => ({ ok, json: async () => body })

describe('dayWindow', () => {
  // 2026-10-26 02:00 UTC is 13:00 AEDT (UTC+11) on the 26th.
  const now = Date.parse('2026-10-26T02:00:00Z')
  it('uses the airport-local date, not the UTC one', () => {
    expect(dayWindow('Australia/Melbourne', 0, now).date).toBe('2026-10-26')
    // 15:00 UTC on the 25th is already the 26th in Sydney.
    expect(dayWindow('Australia/Sydney', 0, Date.parse('2026-10-25T15:00:00Z')).date).toBe('2026-10-26')
  })
  it('moves by dayKey and keeps the UTC window around local midnight', () => {
    const w = dayWindow('Australia/Melbourne', 1, now)
    expect(w.date).toBe('2026-10-27')
    // local midnight 27th = 2026-10-26T13:00Z, inside [from, to]
    expect(w.from).toBeLessThan(Date.parse('2026-10-26T13:00:00Z'))
    expect(w.to).toBeGreaterThan(Date.parse('2026-10-27T12:59:59Z'))
  })
  it('today starts an hour ago, other days at midnight', () => {
    expect(dayWindow('Australia/Melbourne', 0, now).notBefore).toBe('2026-10-26T12:00')
    expect(dayWindow('Australia/Melbourne', -1, now).notBefore).toBe('2026-10-25T00:00')
  })
})

describe('fromMelbourne', () => {
  const [f] = fromMelbourne([melHit()])
  it('maps to the Malaysia flight shape', () => {
    expect(f).toMatchObject({
      afsKey: '21483*48600*TG462*YMML', flightNumber: 'TG 462', status: 'BOARDING', leg: 'D', category: 'I',
      name: 'THAI AIRWAYS', aircraftOperator: 'TG', destination: { city: 'BANGKOK(BKK)' }, terminal: 'T2',
      gate: { name: '5', status: 'BOARDING' }, checkIn: { counters: 'Q' }, scheduledTime: '2026-10-26T00:30:00.000',
    })
  })
  it('keeps the codeshare numbers, naming only airlines it knows', () => {
    const [g] = fromMelbourne([melHit(), melHit({ id: 'x', airlineCode: 'WY', airlineName: 'Oman Air', flightNumber: 'WY1' })])
    expect(g.codeShareFlights).toEqual([
      { afsKey: 'WY5907', flightNumber: 'WY 5907', airlineCode: 'WY', airline: { name: 'OMAN AIR' } },
      { afsKey: 'TK8005', flightNumber: 'TK 8005', airlineCode: 'TK', airline: { name: undefined } },
    ])
  })
  it('arrivals carry the origin, and check-in status is not a gate status', () => {
    const [a] = fromMelbourne([melHit({ flightDirection: 'arrival', status: 'CHECK IN OPEN' })])
    expect(a.leg).toBe('A')
    expect(a.origin.city).toBe('BANGKOK(BKK)')
    expect(a.destination).toBeUndefined()
    expect(a.gate.status).toBe('')
  })
})

describe('fromSydney', () => {
  const names = { QF: 'QANTAS', EK: 'EMIRATES' }
  it('takes gate and check-in from the detail, treating "--" as empty', () => {
    const f = fromSydney(sydItem(), names, sydDetail)
    expect(f.gate).toEqual({ name: 'Q1C', status: 'OPEN' })
    expect(f.checkIn.counters).toBe('')
    expect(f).toMatchObject({ flightNumber: 'QF 499', name: 'QANTAS', category: 'D', terminal: 'T3', scheduledTime: '2026-10-26T22:00' })
  })
  it('trims the stray space Sydney puts before some cities', () => {
    expect(fromSydney(sydItem({ destinations: [' Dallas'] }), names).destination.city).toBe('DALLAS')
  })
  it('has no gate without a detail, and treats extra numbers as codeshares', () => {
    const f = fromSydney(sydItem(), names)
    expect(f.gate.name).toBe('')
    expect(f.codeShareFlights.map(c => [c.flightNumber, c.airline.name])).toEqual([['EK 5358', 'EMIRATES'], ['NZ 1899', undefined]])
  })
})

describe('pick', () => {
  const w = { date: '2026-10-26', notBefore: '2026-10-26T12:00' }
  const flights = fromMelbourne([
    melHit({ id: 'a', flightNumber: 'SQ218', airlineCode: 'SQ', airlineName: 'Singapore Airlines', airports: [{ code: 'SIN', name: 'Singapore' }], scheduledDateTime: '2026-10-26T13:00:00.000', flightCodeshares: [] }),
    melHit({ id: 'b', scheduledDateTime: '2026-10-26T12:30:00.000' }),
    melHit({ id: 'c', scheduledDateTime: '2026-10-26T11:00:00.000' }), // before the window
    melHit({ id: 'd', scheduledDateTime: '2026-10-27T13:00:00.000' }), // another day
  ])
  it('trims to the window and sorts earliest first', () => {
    expect(pick(flights, w, 'all', '').map(f => f.afsKey)).toEqual(['b', 'a'])
  })
  it('flight number: ignores spaces and case, and finds codeshare numbers', () => {
    expect(pick(flights, w, 'flight', 'sq 218').map(f => f.afsKey)).toEqual(['a'])
    expect(pick(flights, w, 'flight', 'wy5907').map(f => f.afsKey)).toEqual(['b'])
  })
  it('city matches the city or its code, and not flight numbers', () => {
    expect(pick(flights, w, 'city', 'sin').map(f => f.afsKey)).toEqual(['a'])
    expect(pick(flights, w, 'city', 'SQ218')).toEqual([])
  })
  it('airline matches the name or the two-letter code', () => {
    expect(pick(flights, w, 'airline', 'singapore').map(f => f.afsKey)).toEqual(['a'])
    expect(pick(flights, w, 'airline', 'tg').map(f => f.afsKey)).toEqual(['b'])
  })
  it('returns at most 25', () => {
    const many = fromMelbourne(Array.from({ length: 40 }, (_, n) => melHit({ id: String(n), scheduledDateTime: '2026-10-26T13:00:00.000' })))
    expect(pick(many, w, 'all', '')).toHaveLength(25)
  })
})

describe('fetchMelbourne / fetchSydney', () => {
  afterEach(() => vi.unstubAllGlobals())
  const now = Date.parse('2026-10-26T02:00:00Z')

  it('Melbourne: asks for the right direction and returns matched flights', async () => {
    const f = vi.fn(async () => reply({ data: { flights: { hits: [melHit({ scheduledDateTime: '2026-10-26T13:30:00.000' })] } } }))
    vi.stubGlobal('fetch', f)
    const out = await fetchMelbourne({ code: 'D', dayKey: 0, key: 'all', value: '', now })
    expect(out).toHaveLength(1)
    expect(decodeURIComponent(f.mock.calls[0][0])).toContain('flightDirection:departure')
  })
  it('Melbourne: a block page (not JSON) is an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('html') } })))
    await expect(fetchMelbourne({ code: 'D', dayKey: 0, key: 'all', value: '', now })).rejects.toThrow('Melbourne Airport data unavailable')
  })

  it('Sydney: detail only for unfinished flights; a failed detail leaves the gate blank', async () => {
    const live = sydItem({ id: 'live', scheduledTime: '13:30' })
    const gone = sydItem({ id: 'gone', scheduledTime: '13:10', status: 'Departed' })
    const broken = sydItem({ id: 'broken', scheduledTime: '13:50', flightNumbers: ['JQ764'], airlineCode: 'JQ', airline: 'Jetstar' })
    const f = vi.fn(async (url) => {
      if (String(url).includes('/_a/flights?')) return reply({ flightData: String(url).includes('domestic') ? [live, gone, broken] : [] })
      if (String(url).includes('/live/')) return reply(sydDetail)
      throw new Error('boom')
    })
    vi.stubGlobal('fetch', f)
    const out = await fetchSydney({ code: 'D', dayKey: 0, key: 'all', value: '', now })
    expect(out.map(x => [x.afsKey, x.gate.name])).toEqual([['gone', ''], ['live', 'Q1C'], ['broken', '']])
    const detailCalls = f.mock.calls.map(c => String(c[0])).filter(u => !u.includes('?'))
    expect(detailCalls.some(u => u.includes('/gone/'))).toBe(false)
    expect(detailCalls.every(u => u.endsWith('/departing'))).toBe(true)
  })
  it('Sydney: an unreadable list is an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(null, false)))
    await expect(fetchSydney({ code: 'A', dayKey: 0, key: 'all', value: '', now })).rejects.toThrow('Sydney Airport data unavailable')
  })
})

// Real aviationstack records (26 Oct 2026), trimmed. Times are Perth wall clock labelled +00:00.
const avs = (o = {}) => ({
  flight_date: '2026-10-26', flight_status: 'active',
  flight: { number: '556', iata: 'VA556', codeshared: null }, airline: { name: 'Virgin Australia' },
  departure: { airport: 'Perth International', iata: 'PER', terminal: '1', gate: '43', scheduled: '2026-10-26T10:10:00+00:00' },
  arrival: { airport: 'Sydney Kingsford Smith Airport', iata: 'SYD', terminal: '2', gate: '39', scheduled: '2026-10-26T17:25:00+00:00' },
  ...o,
})
const avsCs = (iata, airline) => avs({
  flight: { number: iata.slice(2), iata, codeshared: { airline_name: 'virgin australia', flight_iata: 'va556' } }, airline: { name: airline },
})
// 12:00 Perth on the 26th.
const perthNoon = Date.parse('2026-10-26T04:00:00Z')

describe('fromAviationstack', () => {
  const rows = [avs(), avsCs('SQ6879', 'Singapore Airlines'), avsCs('QR8484', 'Qatar Airways'),
    avs({ flight_date: '2026-10-25', departure: { ...avs().departure, scheduled: '2026-10-25T10:10:00+00:00', gate: '46' } })]
  const out = fromAviationstack(rows, 'PER', 'D', perthNoon)

  it('folds the partner records into the operating flight and drops yesterday', () => {
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      flightNumber: 'VA 556', name: 'VIRGIN AUSTRALIA', aircraftOperator: 'VA', status: 'AIRBORNE', leg: 'D',
      terminal: '1', gate: { name: '43', status: '' }, scheduledTime: '2026-10-26T10:10:00',
      destination: { city: 'SYDNEY KINGSFORD SMITH(SYD)' },
    })
    expect(out[0].codeShareFlights.map(c => [c.flightNumber, c.airline.name])).toEqual([['SQ 6879', 'SINGAPORE AIRLINES'], ['QR 8484', 'QATAR AIRWAYS']])
  })
  it('a search by a partner number still shows the operating flight', () => {
    const [f] = fromAviationstack([avsCs('SQ6879', 'Singapore Airlines')], 'PER', 'D', perthNoon)
    expect(f.flightNumber).toBe('VA 556')
    expect(f.name).toBe('VIRGIN AUSTRALIA')
    expect(f.codeShareFlights.map(c => c.flightNumber)).toEqual(['SQ 6879'])
  })
  it('arrivals read the arrival side, and Brisbane terminals get their words', () => {
    const bne = avs({
      flight: { number: '938', iata: 'QF938', codeshared: null }, airline: { name: 'Qantas' },
      departure: { airport: 'Perth International', iata: 'PER', terminal: '4', gate: '14', scheduled: '2026-10-26T12:15:00+00:00' },
      arrival: { airport: 'Brisbane International', iata: 'BNE', terminal: 'D', gate: null, scheduled: '2026-10-26T20:50:00+00:00' },
    })
    const [a] = fromAviationstack([bne], 'BNE', 'A', Date.parse('2026-10-26T04:00:00Z'))
    expect(a).toMatchObject({ leg: 'A', terminal: 'Domestic', gate: { name: '' }, origin: { city: 'PERTH(PER)' }, scheduledTime: '2026-10-26T20:50:00' })
    expect(fromAviationstack([bne], 'PER', 'A', perthNoon)).toEqual([]) // wrong side
  })
})

describe('fetchAviationstack', () => {
  afterEach(() => vi.unstubAllGlobals())
  const args = (o = {}) => ({ terminal: 'PER', code: 'D', dayKey: 0, key: 'flight', value: 'va 556', now: perthNoon, apiKey: 'K', ...o })
  const stub = (body) => { const f = vi.fn(async () => reply(body)); vi.stubGlobal('fetch', f); return f }

  it('sends one request with the airport and flight, and reuses the answer for ten minutes', async () => {
    const f = stub({ data: [avs()] })
    expect(await fetchAviationstack(args())).toHaveLength(1)
    const url = new URL(f.mock.calls[0][0])
    expect(Object.fromEntries(url.searchParams)).toEqual({ access_key: 'K', flight_iata: 'VA556', dep_iata: 'PER' })
    await fetchAviationstack(args({ now: perthNoon + 9 * 60_000 }))
    expect(f).toHaveBeenCalledTimes(1)
    await fetchAviationstack(args({ now: perthNoon + 11 * 60_000 }))
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('arrival searches filter on arr_iata', async () => {
    const f = stub({ data: [] })
    await fetchAviationstack(args({ terminal: 'BNE', code: 'A', value: 'QF861' }))
    expect(new URL(f.mock.calls[0][0]).searchParams.get('arr_iata')).toBe('BNE')
  })
  it('an unknown flight is an empty list, not an error', async () => {
    stub({ data: [] })
    expect(await fetchAviationstack(args({ value: 'ZZ999' }))).toEqual([])
  })
  it('refuses anything but a flight number for today, before spending a request', async () => {
    const f = stub({ data: [] })
    for (const o of [{ value: '' }, { value: 'Singapore' }, { key: 'city' }, { dayKey: 1 }, { dayKey: -1 }]) {
      await expect(fetchAviationstack(args({ value: 'XX1', ...o }))).rejects.toMatchObject({ status: 400 })
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('missing key is a 503; a used-up plan is a 429; a restricted call or junk is a 502', async () => {
    stub({ data: [] })
    await expect(fetchAviationstack(args({ value: 'AB1', apiKey: undefined }))).rejects.toMatchObject({ status: 503 })
    stub({ error: { code: 'usage_limit_reached' } })
    await expect(fetchAviationstack(args({ value: 'AB2' }))).rejects.toMatchObject({ status: 429 })
    stub({ error: { code: 'function_access_restricted' } })
    await expect(fetchAviationstack(args({ value: 'AB3' }))).rejects.toMatchObject({ status: 502 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('html') } })))
    await expect(fetchAviationstack(args({ value: 'AB4' }))).rejects.toMatchObject({ status: 502 })
  })
  it('fetchAuAirport sends PER and BNE here', async () => {
    stub({ data: [avs()] })
    expect(await fetchAuAirport(args({ value: 'va556', now: perthNoon + 99 * 60_000 }))).toHaveLength(1)
  })
})
