import { describe, it, expect } from 'vitest'
import AIRPORTS, { lookupAirport } from './airports'

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
    expect(Object.keys(sample).sort()).toEqual(['city', 'country', 'lat', 'lng', 'name'])
  })
})
