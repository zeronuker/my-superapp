import { describe, it, expect } from 'vitest'
import { resolveLinks, rankBriefings, rankSectors, briefingCount } from './briefingLink'

const sector = (id, over = {}) => ({ id, aircraftId: 'a1', fltNo: '', from: '', dest: '', ...over })
const log = (id, date, sectors, reg = '9M-MXA') => ({ id, date, aircraft: [{ id: 'a1', reg }], sectors })
const ofp = (id, flight, dep, arr, std, tail = '9M-MXA') => ({
  id, savedAt: Date.parse(std), route: { dep, arr, flightDetails: { flight, info: { std, tail } } },
})
const manual = (id, dep, arr, savedAt) => ({ id, savedAt: Date.parse(savedAt), route: { dep, arr } })

const b1 = ofp('b1', 'MXD2623', 'WMKK', 'WSSS', '2026-10-27T01:30:00Z')
const b2 = ofp('b2', 'MXD2624', 'WSSS', 'WMKK', '2026-10-27T09:10:00Z')

describe('resolveLinks', () => {
  it('never links on its own: a log and a briefing that fit stay apart until linked by hand', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'MH2623', from: 'WMKK', dest: 'WSSS' })])
    const r = resolveLinks([l], [b1])
    expect(r.bySector.size).toBe(0)
    expect(r.bySave.size).toBe(0)
  })
  it('a hand-picked link works for a manual briefing', () => {
    const m = manual('m1', 'WMKK', 'WSSS', '2026-10-27T05:00:00Z')
    const l = log('L', '2026-10-27', [sector('s1', { briefingLink: 'm1' })])
    const r = resolveLinks([l], [m, b1])
    expect(r.bySector.get('s1')).toEqual({ saveId: 'm1' })
    expect(r.bySave.get('m1')).toEqual({ logId: 'L', sectorId: 's1' })
  })
  it('a link stays whatever the log says later', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'MH9999', briefingLink: 'b1' })])
    expect(resolveLinks([l], [b1]).bySector.get('s1').saveId).toBe('b1')
  })
  it('links several sectors of one log to different briefings', () => {
    const l = log('L', '2026-10-27', [sector('s1', { briefingLink: 'b1' }), sector('s2', { briefingLink: 'b2' })])
    const r = resolveLinks([l], [b1, b2])
    expect(briefingCount(l, r)).toBe(2)
    expect(r.bySave.get('b2')).toEqual({ logId: 'L', sectorId: 's2' })
  })
  it('ignores an empty link and a link to a deleted briefing', () => {
    const l = log('L', '2026-10-27', [sector('s1', { briefingLink: '' }), sector('s2', { briefingLink: 'gone' }), sector('s3', { briefingLink: 'none' })])
    expect(resolveLinks([l], [b1]).bySector.size).toBe(0)
  })
  it('gives a briefing claimed twice to the first sector', () => {
    const l = log('L', '2026-10-27', [sector('s1', { briefingLink: 'b1' }), sector('s2', { briefingLink: 'b1' })])
    const r = resolveLinks([l], [b1])
    expect(r.bySector.has('s1')).toBe(true)
    expect(r.bySector.has('s2')).toBe(false)
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
  it('best guess matches the flight number digits, ignoring case, spaces and the callsign prefix', () => {
    const l = log('L', '2026-10-27', [sector('s1', { fltNo: 'mh 2623' })])
    expect(rankBriefings(l, l.sectors[0], [b1])[0].auto).toBe(true)
  })
  it('best guess falls back to both airports; one airport alone is not enough', () => {
    const both = log('L', '2026-10-27', [sector('s1', { fltNo: 'XYZ', from: 'wmkk', dest: 'WSSS' })])
    const one = log('L', '2026-10-27', [sector('s1', { from: 'WMKK' })])
    expect(rankBriefings(both, both.sectors[0], [b1])[0].auto).toBe(true)
    expect(rankBriefings(one, one.sectors[0], [b1])[0].auto).toBe(false)
  })
  it('best guess allows one day either way but not two, and never picks a manual briefing', () => {
    const s = { fltNo: 'MH2623' }
    const near = log('L', '2026-10-28', [sector('s1', s)]), twoOff = log('L', '2026-10-29', [sector('s1', s)])
    expect(rankBriefings(near, near.sectors[0], [b1])[0].auto).toBe(true)
    expect(rankBriefings(twoOff, twoOff.sectors[0], [b1])[0].auto).toBe(false)
    const l = log('L', '2026-10-27', [sector('s1', { from: 'WMKK', dest: 'WSSS' })])
    expect(rankBriefings(l, l.sectors[0], [manual('m1', 'WMKK', 'WSSS', '2026-10-27T05:00:00Z')])[0].auto).toBe(false)
  })
  it('rankSectors lists the closest, best-fitting sector first', () => {
    const near = log('N', '2026-10-27', [sector('n1', { fltNo: 'MH2623' })])
    const old = log('O', '2026-01-01', [sector('o1', { fltNo: 'MH2623' })])
    expect(rankSectors([old, near], b1)[0].sector.id).toBe('n1')
  })
})
