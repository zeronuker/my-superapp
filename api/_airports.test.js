import { describe, it, expect, vi, afterEach } from 'vitest'
import { dayWindow, fromMelbourne, fromSydney, pick, fetchMelbourne, fetchSydney } from './_airports.js'

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
