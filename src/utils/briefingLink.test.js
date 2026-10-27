import { describe, it, expect } from 'vitest'
import { resolveLinks, rankBriefings, rankSectors, briefingCount, NO_LINK } from './briefingLink'

const sector = (id, over = {}) => ({ id, aircraftId: 'a1', fltNo: '', from: '', dest: '', ...over })
const log = (id, date, sectors, reg = '9M-MXA') => ({ id, date, aircraft: [{ id: 'a1', reg }], sectors })
const ofp = (id, flight, dep, arr, std, tail = '9M-MXA') => ({
  id, savedAt: Date.parse(std), route: { dep, arr, flightDetails: { flight, info: { std, tail } } },
})
const manual = (id, dep, arr, savedAt) => ({ id, savedAt: Date.parse(savedAt), route: { dep, arr } })

const b1 = ofp('b1', 'MXD2623', 'WMKK', 'WSSS', '2026-10-27T01:30:00Z')
const b2 = ofp('b2', 'MXD2624', 'WSSS', 'WMKK', '2026-10-27T09:10:00Z')

describe('resolveLinks — automatic', () => {
  it('matches by flight number digits, ignoring case, spaces and the callsign prefix', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'mh 2623' })])
    expect(resolveLinks([l], [b1]).bySector.get('s1')).toEqual({ saveId: 'b1', how: 'auto' })
  })
  it('falls back to both airports when the flight number does not match', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'XYZ', from: 'wmkk', dest: 'WSSS' })])
    expect(resolveLinks([l], [b1]).bySector.get('s1').saveId).toBe('b1')
  })
  it('one airport alone is not enough', () => {
    const l = log('L', '2026-10-27', [sector('s1', { from: 'WMKK' })])
    expect(resolveLinks([l], [b1]).bySector.size).toBe(0)
  })
  it('allows one day either way but not two', () => {
    const s = { fltNo: 'MH2623' }
    expect(resolveLinks([log('L', '2026-10-28', [sector('s1', s)])], [b1]).bySector.size).toBe(1)
    expect(resolveLinks([log('L', '2026-10-29', [sector('s1', s)])], [b1]).bySector.size).toBe(0)
  })
  it('never matches a manual briefing on its own', () => {
    const l = log('L', '2026-10-27', [sector('s1', { from: 'WMKK', dest: 'WSSS' })])
    expect(resolveLinks([l], [manual('m1', 'WMKK', 'WSSS', '2026-10-27T05:00:00Z')]).bySector.size).toBe(0)
  })
  it('pairs each briefing with one sector only, the best fit winning', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'MH2623', from: 'WMKK', dest: 'WSSS' }), sector('s2', { fltNo: 'MH2623' })])
    const r = resolveLinks([l], [b1])
    expect(r.bySector.get('s1').saveId).toBe('b1')
    expect(r.bySector.has('s2')).toBe(false)
  })
  it('links several sectors of one log to different briefings', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'MH2623' }), sector('s2', { fltNo: 'MH2624' })])
    const r = resolveLinks([l], [b1, b2])
    expect(briefingCount(l, r)).toBe(2)
    expect(r.bySave.get('b2')).toEqual({ logId: 'L', sectorId: 's2', how: 'auto' })
  })
})

describe('resolveLinks — by hand', () => {
  it('a hand-picked link works for a manual briefing and beats an automatic match', () => {
    const m = manual('m1', 'WMKK', 'WSSS', '2026-10-27T05:00:00Z')
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'MH2623', briefingLink: 'm1' })])
    const r = resolveLinks([l], [m, b1])
    expect(r.bySector.get('s1')).toEqual({ saveId: 'm1', how: 'manual' })
    expect(r.bySave.has('b1')).toBe(false)
  })
  it('unlinked ("none") stays unlinked', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'MH2623', briefingLink: NO_LINK })])
    expect(resolveLinks([l], [b1]).bySector.size).toBe(0)
  })
  it('ignores a link to a deleted briefing', () => {
    const l = log('L', '2026-10-27', [sector('s1', { briefingLink: 'gone' })])
    expect(resolveLinks([l], [b1]).bySector.size).toBe(0)
  })
})

describe('pickers', () => {
  it('rankBriefings puts the best fit first and marks far-off dates', () => {
    const far = ofp('far', 'MXD2623', 'WMKK', 'WSSS', '2026-08-01T01:30:00Z')
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'MH2623' })])
    const r = rankBriefings(l, l.sectors[0], [far, b2, b1])
    expect(r[0].save.id).toBe('b1')
    expect(r[0].auto).toBe(true)
    expect(r.find(x => x.save.id === 'far').near).toBe(false)
  })
  it('rankSectors lists the closest, best-fitting sector first', () => {
    const near = log('N', '2026-10-27', [sector('n1', { fltNo: 'MH2623' })])
    const old = log('O', '2026-01-01', [sector('o1', { fltNo: 'MH2623' })])
    expect(rankSectors([old, near], b1)[0].sector.id).toBe('n1')
  })
})
