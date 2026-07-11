import { describe, it, expect } from 'vitest'
import { normalizeScheduleFlight, normalizeSchedule } from './schedules'

// Shape confirmed against a live /schedules/arrivals and /schedules/departures
// response for WMKK (RapidAPI console + production, 10 Jul 2026).
const RAW_ARRIVAL = { Time: '15:00', Date: '10 Jul', IATA: 'SUB', Origin: 'Surabaya', Flight: 'AK322', Airline: 'Air Asia', Status: 'Estimated 15:12' }
const RAW_DEPARTURE = { Time: '15:00', Date: '10 Jul', IATA: 'LOP', Destination: 'Praya', Flight: 'AK304', Airline: 'Air Asia', Status: 'Departed 15:17' }
const RAW_RESPONSE = { iata: 'KUL', direction: 'arrivals', flights: [RAW_ARRIVAL], total_flights: 442, pages_fetched: 3 }

describe('normalizeScheduleFlight', () => {
  it('maps an arrival, using Origin as the place', () => {
    const f = normalizeScheduleFlight(RAW_ARRIVAL, 'arrivals')
    expect(f.time).toBe('15:00 · 10 Jul')
    expect(f.timeHHMM).toBe('15:00')
    expect(f.flight).toBe('AK322')
    expect(f.airline).toBe('Air Asia')
    expect(f.place).toBe('Surabaya')
    expect(f.placeIata).toBe('SUB')
    expect(f.status).toBe('ESTIMATED 15:12')
    expect(f.statusColor).toBe('var(--cp-orange)')
  })
  it('maps a departure, using Destination as the place', () => {
    const f = normalizeScheduleFlight(RAW_DEPARTURE, 'departures')
    expect(f.place).toBe('Praya')
    expect(f.placeIata).toBe('LOP')
    expect(f.status).toBe('DEPARTED 15:17')
    expect(f.statusColor).toBe('var(--cp-acc)')
  })
  it('falls back sanely on a missing flight number', () => {
    const f = normalizeScheduleFlight({}, 'arrivals')
    expect(f.flight).toBe('—')
    expect(f.place).toBeNull()
    expect(f.status).toBeNull()
  })
})

describe('normalizeSchedule', () => {
  it('maps the flights array', () => {
    const flights = normalizeSchedule(RAW_RESPONSE, 'arrivals')
    expect(flights).toHaveLength(1)
    expect(flights[0].flight).toBe('AK322')
  })
  it('returns an empty array for a missing/malformed response', () => {
    expect(normalizeSchedule(null, 'arrivals')).toEqual([])
    expect(normalizeSchedule({}, 'arrivals')).toEqual([])
  })
})
