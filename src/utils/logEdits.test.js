import { describe, it, expect } from 'vitest'
import { editedParts, linksToAsk } from './logEdits'

const sector = (id, over = {}) => ({ id, fltNo: '', from: '', dest: '', ...over })
const mk = (sectors, over = {}) => ({
  id: 'L', date: '2026-10-27', aircraft: [{ id: 'a1', reg: '9M-A' }], notes: '', crew: [{ id: 'c1', name: '' }], updatedAt: 1, sectors, ...over,
})
const before = mk([sector('s1', { fltNo: 'MH1' }), sector('s2', { fltNo: 'MH2' }), sector('s3')])
const edit = (patch) => mk(before.sectors.map(s => (s.id === patch.id ? { ...s, ...patch.set } : s)))
const baseline = [{ sectorId: 's1', saveId: 'b1' }, { sectorId: 's2', saveId: 'b2' }]
const now = new Map([['s1', { saveId: 'b1' }], ['s2', { saveId: 'b2' }]])
const ask = (after) => linksToAsk(before, after, baseline, now).map(l => l.sectorId)

describe('editedParts', () => {
  it('sees nothing when only the save stamp and the link fields differ', () => {
    const after = mk(before.sectors.map(s => ({ ...s, briefingLink: 'b1' })), { updatedAt: 99 })
    expect(editedParts(before, after)).toEqual({ sectorIds: [], other: [] })
  })
  it('names the sectors whose own fields changed', () => {
    expect(editedParts(before, edit({ id: 's2', set: { fuelOff: '5' } })).sectorIds).toEqual(['s2'])
  })
  it('names what changed outside the sectors', () => {
    const after = mk(before.sectors, { aircraft: [{ id: 'a1', reg: '9M-B' }], notes: 'x' })
    expect(editedParts(before, after).other).toEqual(['the aircraft', 'the notes'])
  })
  it('counts an added sector as outside the sectors', () => {
    expect(editedParts(before, mk([...before.sectors, sector('s4')])).other).toEqual(['the sectors'])
  })
  it('an edit that is put back is no edit', () => {
    const after = mk(before.sectors.map(s => ({ ...s })))
    expect(editedParts(before, after)).toEqual({ sectorIds: [], other: [] })
  })
})

describe('linksToAsk', () => {
  it('asks nothing when nothing was edited', () => expect(ask(mk(before.sectors))).toEqual([]))
  it('asks about the one linked sector that was edited', () => {
    expect(ask(edit({ id: 's1', set: { fltNo: 'MH9' } }))).toEqual(['s1'])
  })
  it('leaves out an edited sector that has no link', () => {
    expect(ask(edit({ id: 's3', set: { fltNo: 'MH9' } }))).toEqual([])
  })
  it('asks about only the edited ones when several are linked', () => {
    expect(ask(edit({ id: 's2', set: { from: 'WMKK' } }))).toEqual(['s2'])
  })
  it('asks about every link after an edit outside the sectors', () => {
    expect(ask(mk(before.sectors, { notes: 'x' }))).toEqual(['s1', 's2'])
  })
  it('asks about every link after both kinds of edit', () => {
    const after = mk(before.sectors.map(s => (s.id === 's3' ? { ...s, from: 'X' } : s)), { notes: 'x' })
    expect(ask(after)).toEqual(['s1', 's2'])
  })
  it('skips a sector unlinked or re-linked since opening', () => {
    const edited = edit({ id: 's1', set: { fltNo: 'MH9' } })
    expect(linksToAsk(before, edited, baseline, new Map([['s2', { saveId: 'b2' }]])).map(l => l.sectorId)).toEqual([])
    expect(linksToAsk(before, edited, baseline, new Map([['s1', { saveId: 'other' }]])).map(l => l.sectorId)).toEqual([])
  })
  it('skips a sector that was removed', () => {
    expect(ask(mk(before.sectors.filter(s => s.id !== 's1'), { notes: 'x' }))).toEqual(['s2'])
  })
})
