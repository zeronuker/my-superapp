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
    expect(notam.snapshot).toEqual({ at: 1_000, notams: [{ id: 'A1' }, { id: 'B2' }] })
    expect(notam.rawPerIcao).toBeUndefined()
    expect(notam.extraChips[0].icao).toBe('WMFC')
    expect(sigmet.snapshotAt).toBe(1_000)
    expect(sigmet.sigmets).toEqual([{ id: 's1' }])
    expect(metar.fetchedAt).toBeGreaterThan(1_000)  // "now", so the 12 h expiry keeps it
  })
})
