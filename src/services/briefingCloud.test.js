import { describe, it, expect, vi } from 'vitest'

// The two stores are only used by the UI-facing calls; these tests cover the pure parts.
vi.mock('../store/calculatorStore', () => ({ useCalculatorStore: { getState: () => ({}) } }))
vi.mock('../modules/dutylog/store/dutylogStore', () => ({ default: { getState: () => ({}) } }))

import { planSync, splitMap, syncSaves, fetchAll, MAP_PIECE_CHARS } from './briefingCloud'

const save = (id, name, mapSnapshot = 'img') => ({ id, name, savedAt: 1, route: {}, data: {}, mapSnapshot })

// A fake cloud: items are what list() returns; sent records everything uploaded, in order.
function fakeApi({ items = [], entries = {}, pieces = {}, listError = null } = {}) {
  const sent = []
  return {
    sent,
    list: async () => { if (listError) throw listError; return items },
    get: async (_c, id) => entries[id],
    getPart: async (_c, id, n) => pieces[id][n],
    put: async (_c, _d, e, mapParts) => { sent.push(['put', e.id, mapParts, e.mapSnapshot]) },
    putPart: async (_c, _d, id, n, data) => { sent.push(['part', id, n, data]) },
    remove: async (_c, _d, id) => { sent.push(['remove', id]) },
    claim: async () => items,
  }
}

describe('planSync', () => {
  it('pushes new saves and renamed ones, removes cloud copies that are gone', () => {
    const saves = [save('a', 'A'), save('b', 'B2'), save('c', 'C')]
    const cloud = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'gone', name: 'X' }]
    const { push, remove } = planSync(saves, cloud)
    expect(push.map(s => s.id)).toEqual(['b', 'c'])
    expect(remove).toEqual(['gone'])
  })

  it('does nothing when the cloud already matches', () => {
    expect(planSync([save('a', 'A')], [{ id: 'a', name: 'A' }])).toEqual({ push: [], remove: [] })
  })
})

describe('splitMap', () => {
  it('has no pieces for no map, one for a small map', () => {
    expect(splitMap(null)).toEqual([])
    expect(splitMap('small')).toEqual(['small'])
  })

  it('cuts a big map into pieces that join back to the original', () => {
    const map = 'x'.repeat(MAP_PIECE_CHARS * 2 + 5)
    const pieces = splitMap(map)
    expect(pieces.map(p => p.length)).toEqual([MAP_PIECE_CHARS, MAP_PIECE_CHARS, 5])
    expect(pieces.join('')).toBe(map)
  })
})

describe('syncSaves', () => {
  it('sends the map pieces, then the briefing without its map, then the deletes', async () => {
    const api = fakeApi({ items: [{ id: 'old', name: 'Old', mapParts: 0 }] })
    const synced = await syncSaves('CODE', 'dev', [save('a', 'A')], api)
    expect(api.sent).toEqual([['part', 'a', 0, 'img'], ['put', 'a', 1, null], ['remove', 'old']])
    expect(synced).toEqual({ a: 'A' })
  })

  it('never leaves a map out, however big', async () => {
    const map = 'm'.repeat(MAP_PIECE_CHARS * 3)
    const api = fakeApi()
    await syncSaves('CODE', 'dev', [save('a', 'A', map)], api)
    expect(api.sent.filter(s => s[0] === 'part').map(s => s[3]).join('')).toBe(map)
    expect(api.sent.at(-1)).toEqual(['put', 'a', 3, null])
  })

  it('a briefing without a map sends just the briefing', async () => {
    const api = fakeApi()
    await syncSaves('CODE', 'dev', [save('a', 'A', null)], api)
    expect(api.sent).toEqual([['put', 'a', 0, null]])
  })

  it('a rename does not send the map again', async () => {
    const api = fakeApi({ items: [{ id: 'a', name: 'Old name', mapParts: 1 }] })
    await syncSaves('CODE', 'dev', [save('a', 'New name')], api)
    expect(api.sent).toEqual([['put', 'a', 1, null]])
  })

  it('treats a code with no backup yet as empty', async () => {
    const api = fakeApi({ listError: Object.assign(new Error('none'), { status: 404 }) })
    await syncSaves('CODE', 'dev', [save('a', 'A')], api)
    expect(api.sent.map(s => s[0])).toEqual(['part', 'put'])
  })

  it('lets other errors (e.g. 403 not the owner) through', async () => {
    const api = fakeApi({ listError: Object.assign(new Error('owned'), { status: 403 }) })
    await expect(syncSaves('CODE', 'dev', [], api)).rejects.toThrow('owned')
  })
})

describe('fetchAll', () => {
  it('downloads every briefing and puts its map back together', async () => {
    const api = fakeApi({
      items: [{ id: 'a' }, { id: 'b' }],
      entries: { a: { entry: save('a', 'A', null), mapParts: 2 }, b: { entry: save('b', 'B', null), mapParts: 0 } },
      pieces: { a: ['one-', 'two'] },
    })
    const out = await fetchAll('CODE', 'dev', api)
    expect(out.map(e => [e.id, e.mapSnapshot])).toEqual([['a', 'one-two'], ['b', null]])
  })
})
