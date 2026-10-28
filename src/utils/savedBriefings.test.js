import { describe, it, expect } from 'vitest'
import { briefingRow, autoBriefingName, formatSnapshotStamp, savedRowInfo, filterSaves, sortByNewest, findOldest, isAtCap, pickNextAfterDelete, makeBriefingId } from './savedBriefings'

describe('filterSaves', () => {
  const at = Date.UTC(2026, 8, 15, 13, 2)
  const route = { dep: 'WMKK', arr: 'WSSS', flightDetails: { flight: 'MH2623', info: { tail: '9M-MXA', type: 'B737-800WS', ofpNo: '41' } } }
  const manual = { dep: 'WMKK', arr: 'WBKK' }
  const saves = [
    { id: 'a', name: autoBriefingName(route, at), route, savedAt: at },
    { id: 'b', name: 'KK charter check', route: manual, savedAt: at },
  ]
  const ids = q => filterSaves(saves, q).map(s => s.id)
  it('returns everything for an empty or blank query', () => {
    expect(ids('')).toEqual(['a', 'b'])
    expect(ids('   ')).toEqual(['a', 'b'])
    expect(filterSaves(saves, undefined)).toBe(saves)
  })
  it('matches flight, ICAO, tail, OFP number and the OFP / MANUAL tag, ignoring case', () => {
    expect(ids('mh2623')).toEqual(['a'])
    expect(ids('wbkk')).toEqual(['b'])
    expect(ids('9m-mxa')).toEqual(['a'])
    expect(ids('manual')).toEqual(['b'])
    expect(ids('ofp')).toEqual(['a'])
  })
  it('matches a custom name', () => {
    expect(ids('charter')).toEqual(['b'])
  })
  it('matches the saved date as text and as ISO', () => {
    expect(ids('sep')).toEqual(['a', 'b'])
    expect(ids('15 sep')).toEqual(['a', 'b'])
    expect(ids('2026-09-15')).toEqual(['a', 'b'])
    expect(ids('2026-09')).toEqual(['a', 'b'])
    expect(ids('oct')).toEqual([])
  })
  it('matches the flight date of an OFP save', () => {
    const ofp = { id: 'c', name: 'x', savedAt: at, route: { dep: 'WMKK', arr: 'WSSS', flightDetails: { flight: 'MH1', info: { std: '2026-10-02T01:30:00Z' } } } }
    expect(filterSaves([ofp], 'oct').map(s => s.id)).toEqual(['c'])
    expect(filterSaves([ofp], '2026-10-02').map(s => s.id)).toEqual(['c'])
  })
  it('needs every word to match', () => {
    expect(ids('wmkk wsss')).toEqual(['a'])
    expect(ids('wmkk nothing')).toEqual([])
  })
})

describe('savedRowInfo', () => {
  const savedAt = Date.UTC(2026, 8, 15, 13, 2)
  const ofpRoute = {
    dep: 'WMKK', arr: 'WSSS',
    routeText: 'WMKK ABC:3.1:101.7 DEF:2.5:102.0 WSSS',
    flightDetails: { flight: 'MH2623', info: { tail: '9M-MXA', type: 'B737-800WS/CFM56-7B24', ofpNo: '41', std: '2026-09-15T14:20:00Z', sta: '2026-09-15T16:05:00Z' } },
  }
  it('reads an OFP save: flight, tail, type, OFP number, UTC times and date', () => {
    const r = savedRowInfo({ name: autoBriefingName(ofpRoute, savedAt), route: ofpRoute, savedAt })
    expect(r).toMatchObject({ isOfp: true, flight: 'MH2623', tail: '9M-MXA', type: 'B737-800WS/CFM56-7B24', ofpNo: '41', std: '14:20Z', sta: '16:05Z', stdDate: '15 Sep' })
  })
  it('reads a manual save: no flight details', () => {
    const route = { dep: 'WMKK', arr: 'WBKK', routeText: 'WMKK KANKA VPL WBKK' }
    const r = savedRowInfo({ name: autoBriefingName(route, savedAt), route, savedAt })
    expect(r).toMatchObject({ isOfp: false, flight: null, tail: null, std: null, stdDate: null })
  })
  it('gives customName only when the name was changed from the auto one', () => {
    const route = { dep: 'WMKK', arr: 'WMKJ' }
    expect(savedRowInfo({ name: autoBriefingName(route, savedAt), route, savedAt }).customName).toBeNull()
    expect(savedRowInfo({ name: 'KK charter check', route, savedAt }).customName).toBe('KK charter check')
  })
})

describe('autoBriefingName', () => {
  it('formats dep + arr + date + time', () => {
    const ts = Date.UTC(2026, 8, 15, 14, 20) // 15 Sep 2026 14:20 UTC
    expect(autoBriefingName({ dep: 'WMKK', arr: 'WSSS' }, ts)).toBe('WMKK → WSSS · 15 Sep 14:20')
  })
  it('falls back to whichever of dep/arr exists', () => {
    const ts = Date.UTC(2026, 8, 15, 14, 20)
    expect(autoBriefingName({ dep: 'WMKK', arr: '' }, ts)).toBe('WMKK · 15 Sep 14:20')
    expect(autoBriefingName({ dep: '', arr: 'WSSS' }, ts)).toBe('WSSS · 15 Sep 14:20')
  })
  it('falls back to a generic label with neither', () => {
    const ts = Date.UTC(2026, 8, 15, 14, 20)
    expect(autoBriefingName({ dep: '', arr: '' }, ts)).toBe('Briefing · 15 Sep 14:20')
  })
})

describe('formatSnapshotStamp', () => {
  it('formats a timestamp as UTC day, month, HH:MMZ', () => {
    expect(formatSnapshotStamp(Date.UTC(2026, 8, 5, 4, 7))).toBe('5 Sep 04:07Z')
    expect(formatSnapshotStamp(Date.UTC(2026, 9, 10, 14, 20))).toBe('10 Oct 14:20Z')
  })
  it('returns an empty string for a missing or invalid timestamp', () => {
    expect(formatSnapshotStamp(null)).toBe('')
    expect(formatSnapshotStamp(undefined)).toBe('')
    expect(formatSnapshotStamp('not a date')).toBe('')
  })
})

describe('sortByNewest', () => {
  it('orders by savedAt descending without mutating the input', () => {
    const list = [{ id: 'a', savedAt: 100 }, { id: 'b', savedAt: 300 }, { id: 'c', savedAt: 200 }]
    const sorted = sortByNewest(list)
    expect(sorted.map(b => b.id)).toEqual(['b', 'c', 'a'])
    expect(list.map(b => b.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('findOldest', () => {
  it('returns the entry with the smallest savedAt', () => {
    const list = [{ id: 'a', savedAt: 100 }, { id: 'b', savedAt: 300 }, { id: 'c', savedAt: 200 }]
    expect(findOldest(list).id).toBe('a')
  })
  it('returns null for an empty list', () => {
    expect(findOldest([])).toBeNull()
  })
})

describe('isAtCap', () => {
  it('is false below the cap and true at or above it', () => {
    const under = Array.from({ length: 29 }, (_, i) => ({ id: String(i), savedAt: i }))
    const at = Array.from({ length: 30 }, (_, i) => ({ id: String(i), savedAt: i }))
    expect(isAtCap(under, 30)).toBe(false)
    expect(isAtCap(at, 30)).toBe(true)
  })
})

describe('pickNextAfterDelete', () => {
  const sorted = [{ id: 'newest', savedAt: 300 }, { id: 'mid', savedAt: 200 }, { id: 'oldest', savedAt: 100 }]
  it('picks the entry after the deleted one when it is not last', () => {
    expect(pickNextAfterDelete(sorted, 'newest')).toBe('mid')
  })
  it('falls back to the previous entry when the deleted one was last', () => {
    expect(pickNextAfterDelete(sorted, 'oldest')).toBe('mid')
  })
  it('returns null once the list would become empty', () => {
    expect(pickNextAfterDelete([{ id: 'only', savedAt: 1 }], 'only')).toBeNull()
  })
  it('returns null if the id is not found', () => {
    expect(pickNextAfterDelete(sorted, 'missing')).toBeNull()
  })
})

describe('makeBriefingId', () => {
  it('generates non-empty, unique ids', () => {
    const a = makeBriefingId()
    const b = makeBriefingId()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

describe('briefingRow', () => {
  const at = Date.UTC(2026, 8, 15, 13, 2)
  it('adds route and save time to the row info, and survives JSON (it is sent to the cloud)', () => {
    const route = { dep: 'WMKK', arr: 'WSSS', flightDetails: { flight: 'MH2623', info: { tail: '9M-MXA', ofpNo: '41' } } }
    const row = briefingRow({ id: 'a', name: 'x', route, savedAt: at })
    expect(row).toMatchObject({ dep: 'WMKK', arr: 'WSSS', savedAt: at, isOfp: true, flight: 'MH2623', tail: '9M-MXA' })
    expect(JSON.parse(JSON.stringify(row))).toEqual(row)
  })
  it('a manual save has no flight details', () => {
    expect(briefingRow({ id: 'b', name: 'Mine', route: { dep: 'WMKK', arr: 'VHHH' }, savedAt: at }))
      .toMatchObject({ isOfp: false, flight: null, dep: 'WMKK', arr: 'VHHH', customName: 'Mine' })
  })
})
