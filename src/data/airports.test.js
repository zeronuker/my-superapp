import { describe, it, expect } from 'vitest'
import AIRPORTS, { lookupAirport, searchAirports } from './airports'

describe('airports database', () => {
  it('bundles the worldwide dataset (thousands of airports)', () => {
    expect(Object.keys(AIRPORTS).length).toBeGreaterThan(4000)
  })

  it('looks up by ICAO, case-insensitive', () => {
    const kl = lookupAirport('wmkk')
    expect(kl).toBeTruthy()
    expect(kl.city).toBeTruthy()
    expect(typeof kl.lat).toBe('number')
    expect(typeof kl.lng).toBe('number')
  })

  it('includes RJBB (Kansai) and major global hubs', () => {
    for (const icao of ['RJBB', 'WMKK', 'WSSS', 'EGLL', 'KJFK', 'OMDB', 'SBGR', 'MMMX']) {
      expect(lookupAirport(icao), icao).toBeTruthy()
    }
  })

  it('returns null for unknown or too-short codes', () => {
    expect(lookupAirport('ZZZ')).toBeNull()
    expect(lookupAirport('')).toBeNull()
    expect(lookupAirport(null)).toBeNull()
  })

  it('every entry has the expected shape', () => {
    const sample = lookupAirport('EGLL')
    const keys = Object.keys(sample).sort()
    expect(keys).toContain('city')
    expect(keys).toContain('country')
    expect(keys).toContain('lat')
    expect(keys).toContain('lng')
    expect(keys).toContain('name')
  })

  it('major airports have IANA timezone data', () => {
    for (const icao of ['WMKK', 'OMDB', 'YBBN', 'EGLL', 'VIDP']) {
      const a = lookupAirport(icao)
      expect(a.tz, icao).toBeTruthy()
    }
  })
})

describe('searchAirports', () => {
  it('returns [] for short queries', () => {
    expect(searchAirports('')).toEqual([])
    expect(searchAirports('W')).toEqual([])
  })

  it('ranks ICAO-prefix matches first', () => {
    const results = searchAirports('WMK')
    expect(results[0].icao.startsWith('WMK')).toBe(true)
    expect(results.some(r => r.icao === 'WMKK')).toBe(true)
  })

  it('matches by city name', () => {
    const results = searchAirports('kuala lumpur')
    expect(results.some(r => r.icao === 'WMKK')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(searchAirports('wmkk')[0].icao).toBe('WMKK')
  })
})
