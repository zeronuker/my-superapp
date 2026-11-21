import { describe, it, expect, beforeEach } from 'vitest'
import { syncSnapshotCaches } from './briefingSync'
import { METAR_CACHE_KEY, NOTAM_CACHE_KEY, SIGMET_CACHE_KEY } from '../utils/moduleCacheKeys'

const store = {}
beforeEach(() => {
  for (const k in store) delete store[k]
  globalThis.localStorage = { setItem: (k, v) => { store[k] = v }, getItem: k => store[k] ?? null, removeItem: k => { delete store[k] } }
})

describe('syncSnapshotCaches', () => {
  it('fills all 3 module caches from a save and flags them as a snapshot', () => {
    const route = { dep: 'WMKK', arr: 'WSSS', destAlts: { alt1: '', alt2: '' }, enrouteCount: 0, enrouteAlts: [] }
    const data = {
      fetchedAt: 1_000,
      airports: [{ key: 'dep', icao: 'WMKK', label: 'DEPARTURE', metar: [], taf: [] }],
      notamsByIcao: { WMKK: [{ id: 'A1' }], WMFC: [{ id: 'B2' }] },
      firsUsed: [{ icao: 'WMFC', name: 'Kuala Lumpur FIR' }],
      sigmets: [{ id: 's1' }],
    }
    syncSnapshotCaches(route, data)
    const metar = JSON.parse(store[METAR_CACHE_KEY])
    const notam = JSON.parse(store[NOTAM_CACHE_KEY])
    const sigmet = JSON.parse(store[SIGMET_CACHE_KEY])
    expect(metar.snapshotAt).toBe(1_000)
    expect(metar.results.dep.icao).toBe('WMKK')
    expect(notam.snapshot).toEqual({ at: 1_000, notams: [{ id: 'A1' }, { id: 'B2' }], failed: [] })
    expect(notam.rawPerIcao).toBeUndefined()
    expect(notam.extraChips[0].icao).toBe('WMFC')
    expect(sigmet.snapshotAt).toBe(1_000)
    expect(sigmet.sigmets).toEqual([{ id: 's1' }])
    expect(metar.fetchedAt).toBeGreaterThan(1_000)  // "now", so the 12 h expiry keeps it
  })
})

describe('syncSnapshotCaches (failed lookups stay failed)', () => {
  const route = { dep: 'WMKK', arr: 'WSSS', destAlts: { alt1: '', alt2: '' }, enrouteCount: 0, enrouteAlts: [] }

  it('keeps a failed weather lookup flagged in the METAR cache and a failed NOTAM list in the snapshot', () => {
    syncSnapshotCaches(route, {
      airports: [{ key: 'dep', icao: 'WMKK', label: 'DEPARTURE', metar: [], taf: [], failed: { metar: true, taf: false } }],
      notamsByIcao: {}, notamFailed: ['WMKK'], sigmets: [], firsUsed: [], fetchedAt: 1_000,
    })
    expect(JSON.parse(store[METAR_CACHE_KEY]).results.dep.failed).toEqual({ metar: true, taf: false })
    expect(JSON.parse(store[NOTAM_CACHE_KEY]).snapshot.failed).toEqual(['WMKK'])
  })

  it('does not store "no SIGMETs" when the SIGMET lookup failed, and clears an older SIGMET cache', () => {
    store[SIGMET_CACHE_KEY] = JSON.stringify({ sigmets: [{ id: 'old' }] })
    syncSnapshotCaches(route, { airports: [], notamsByIcao: {}, sigmets: [], firsUsed: [], sigmetFailed: true, fetchedAt: 1_000 })
    expect(store[SIGMET_CACHE_KEY]).toBeUndefined()
  })
})
