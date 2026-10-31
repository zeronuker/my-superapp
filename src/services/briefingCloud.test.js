import { describe, it, expect, vi } from 'vitest'

// The two stores are only used by the UI-facing calls; these tests cover the pure parts.
const duty = vi.hoisted(() => ({ state: {}, pushLogs: vi.fn() }))
vi.mock('../store/calculatorStore', () => ({ useCalculatorStore: { getState: () => ({}) } }))
vi.mock('../modules/dutylog/store/dutylogStore', () => ({ default: { getState: () => duty.state } }))
vi.mock('../modules/dutylog/services/sync', () => ({ pushLogs: duty.pushLogs }))

import { planSync, splitMap, syncSaves, pushSaves, syncLogsNow, fetchOne, fetchAll, MAP_PIECE_CHARS } from './briefingCloud'

const save = (id, name, mapSnapshot = 'img') => ({ id, name, savedAt: 1, route: { dep: 'WMKK', arr: 'WSSS' }, data: {}, mapSnapshot })

// A fake cloud: items are what list() returns; sent records everything uploaded, in order.
function fakeApi({ items = [], entries = {}, pieces = {}, listError = null } = {}) {
  const sent = []
  const puts = []   // what each put carried besides the map: the entry, its row and the picture counts
  return {
    sent, puts,
    list: async () => { if (listError) throw listError; return items },
    get: async (_c, id) => entries[id],
    getPart: async (_c, id, n, what = 'map') => (what === 'map' ? pieces[id] : pieces[id][what])[n],
    put: async (_c, _d, e, mapParts, row, counts) => { sent.push(['put', e.id, mapParts, e.mapSnapshot, row?.dep]); puts.push({ entry: e, row, counts }) },
    putPart: async (_c, _d, id, n, data, what = 'map') => { sent.push(what === 'map' ? ['part', id, n, data] : ['part', id, n, data, what]) },
    remove: async (_c, _d, id) => { sent.push(['remove', id]) },
    claim: async () => items,
  }
}

// A save with a cloud (sat) and/or winds picture, as the Satellite tab keeps them.
const withPictures = (s, { sat, wind } = {}) => ({
  ...s,
  ...(sat ? { satSnapshot: { image: sat.image, takenAt: sat.at, region: 'himawari' } } : {}),
  ...(wind ? { windSnapshot: { image: wind.image, takenAt: wind.at, fl: 340 } } : {}),
})

describe('planSync', () => {
  it('pushes new saves and renamed ones, removes cloud copies that are gone', () => {
    const saves = [save('a', 'A'), save('b', 'B2'), save('c', 'C')]
    const cloud = [{ id: 'a', name: 'A', row: {} }, { id: 'b', name: 'B', row: {} }, { id: 'gone', name: 'X', row: {} }]
    const { push, remove } = planSync(saves, cloud)
    expect(push.map(s => s.id)).toEqual(['b', 'c'])
    expect(remove).toEqual(['gone'])
  })

  it('does nothing when the cloud already matches', () => {
    expect(planSync([save('a', 'A')], [{ id: 'a', name: 'A', row: {} }])).toEqual({ push: [], remove: [] })
  })

  it('re-sends a briefing the cloud holds without its row summary (uploaded before rows existed)', () => {
    expect(planSync([save('a', 'A')], [{ id: 'a', name: 'A', mapParts: 1 }]).push.map(s => s.id)).toEqual(['a'])
  })
})

describe('planSync and pictures', () => {
  const s = withPictures(save('a', 'A'), { sat: { image: 'i', at: 100 } })

  it('re-sends a briefing whose cloud or winds picture the cloud does not hold (or holds another of)', () => {
    expect(planSync([s], [{ id: 'a', name: 'A', row: {} }]).push.map(x => x.id)).toEqual(['a'])
    expect(planSync([s], [{ id: 'a', name: 'A', row: { satAt: 99 } }]).push.map(x => x.id)).toEqual(['a'])
    expect(planSync([withPictures(save('a', 'A'), { wind: { image: 'w', at: 5 } })], [{ id: 'a', name: 'A', row: {} }]).push.map(x => x.id)).toEqual(['a'])
  })

  it('leaves it be when the pictures match', () => {
    expect(planSync([s], [{ id: 'a', name: 'A', row: { satAt: 100 } }]).push).toEqual([])
  })

  it('re-sends a briefing whose picture is gone from the device, so the cloud copy loses it too', () => {
    expect(planSync([save('a', 'A')], [{ id: 'a', name: 'A', row: { satAt: 100 } }]).push.map(x => x.id)).toEqual(['a'])
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
    expect(api.sent).toEqual([['part', 'a', 0, 'img'], ['put', 'a', 1, null, 'WMKK'], ['remove', 'old']])
    expect(synced).toEqual({ a: 'A' })
  })

  it('never leaves a map out, however big', async () => {
    const map = 'm'.repeat(MAP_PIECE_CHARS * 3)
    const api = fakeApi()
    await syncSaves('CODE', 'dev', [save('a', 'A', map)], api)
    expect(api.sent.filter(s => s[0] === 'part').map(s => s[3]).join('')).toBe(map)
    expect(api.sent.at(-1)).toEqual(['put', 'a', 3, null, 'WMKK'])
  })

  it('a briefing without a map sends just the briefing', async () => {
    const api = fakeApi()
    await syncSaves('CODE', 'dev', [save('a', 'A', null)], api)
    expect(api.sent).toEqual([['put', 'a', 0, null, 'WMKK']])
  })

  it('a rename does not send the map again', async () => {
    const api = fakeApi({ items: [{ id: 'a', name: 'Old name', mapParts: 1, row: {} }] })
    await syncSaves('CODE', 'dev', [save('a', 'New name')], api)
    expect(api.sent).toEqual([['put', 'a', 1, null, 'WMKK']])
  })

  it('reports progress: before the first send, then after each one', async () => {
    const api = fakeApi({ items: [{ id: 'old', name: 'Old', row: {} }] })
    const seen = []
    await syncSaves('CODE', 'dev', [save('a', 'A'), save('b', 'B')], api, (done, total) => seen.push([done, total]))
    expect(seen).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]])
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

describe('syncSaves with the Satellite pictures', () => {
  it('sends map, cloud and winds pieces first, then the briefing with no picture data in it', async () => {
    const api = fakeApi()
    const s = withPictures(save('a', 'A'), { sat: { image: 'SAT', at: 1 }, wind: { image: 'WIND', at: 2 } })
    await syncSaves('CODE', 'dev', [s], api)
    expect(api.sent).toEqual([['part', 'a', 0, 'img'], ['part', 'a', 0, 'SAT', 'sat'], ['part', 'a', 0, 'WIND', 'wind'], ['put', 'a', 1, null, 'WMKK']])
    const { entry, row, counts } = api.puts[0]
    expect(entry.satSnapshot).toEqual({ image: null, takenAt: 1, region: 'himawari' })
    expect(entry.windSnapshot).toEqual({ image: null, takenAt: 2, fl: 340 })
    expect(counts).toEqual({ satParts: 1, windParts: 1 })
    expect([row.satAt, row.windAt]).toEqual([1, 2])
  })

  it('sends a briefing without pictures as before, with zero counts', async () => {
    const api = fakeApi()
    await syncSaves('CODE', 'dev', [save('a', 'A', null)], api)
    expect(api.sent).toEqual([['put', 'a', 0, null, 'WMKK']])
    expect(api.puts[0].counts).toEqual({ satParts: 0, windParts: 0 })
  })

  it('does not send a picture again when the cloud holds this very one (a rename)', async () => {
    const s = withPictures(save('a', 'New'), { sat: { image: 'SAT', at: 1 } })
    const api = fakeApi({ items: [{ id: 'a', name: 'Old', mapParts: 1, satParts: 1, windParts: 0, row: { satAt: 1, windAt: null } }] })
    await syncSaves('CODE', 'dev', [s], api)
    expect(api.sent).toEqual([['put', 'a', 1, null, 'WMKK']])
  })

  it('sends only the picture that changed (a retaken cloud picture, the same winds)', async () => {
    const s = withPictures(save('a', 'A'), { sat: { image: 'NEWSAT', at: 9 }, wind: { image: 'WIND', at: 2 } })
    const api = fakeApi({ items: [{ id: 'a', name: 'A', mapParts: 1, satParts: 1, windParts: 1, row: { satAt: 1, windAt: 2 } }] })
    await syncSaves('CODE', 'dev', [s], api)
    expect(api.sent).toEqual([['part', 'a', 0, 'NEWSAT', 'sat'], ['put', 'a', 1, null, 'WMKK']])
  })

  it('a real-size briefing (text 423 kB + pictures 628 kB) goes up in documents all under the 900 000 limit', async () => {
    const LIMIT = 900_000
    const s = withPictures(
      { ...save('a', 'A', 'm'.repeat(1_500_000)), data: { notams: 'n'.repeat(423_000) } },
      { sat: { image: 's'.repeat(400_000), at: 1 }, wind: { image: 'w'.repeat(228_000), at: 2 } },
    )
    const docs = []
    const api = fakeApi()
    const { putPart, put } = api
    api.putPart = async (c, d, id, n, data, what) => { docs.push(data.length); return putPart(c, d, id, n, data, what) }
    api.put = async (c, d, e, ...rest) => { docs.push(JSON.stringify(e).length); return put(c, d, e, ...rest) }
    await syncSaves('CODE', 'dev', [s], api)
    expect(Math.max(...docs)).toBeLessThanOrEqual(LIMIT)
    expect(JSON.stringify(s).length).toBeGreaterThan(LIMIT)   // it would not have fitted as one document
    const joined = what => api.sent.filter(x => x[0] === 'part' && (x[4] ?? 'map') === what).map(x => x[3]).join('')
    expect(joined('map')).toBe(s.mapSnapshot)
    expect(joined('sat')).toBe(s.satSnapshot.image)
    expect(joined('wind')).toBe(s.windSnapshot.image)
  })
})

describe('pushSaves', () => {
  it('sends just the given briefings, even if the cloud already has them, and deletes nothing', async () => {
    const api = fakeApi({ items: [{ id: 'a', name: 'A', mapParts: 1, row: {} }, { id: 'other', name: 'Other', mapParts: 0, row: {} }] })
    const sent = await pushSaves('CODE', 'dev', [save('a', 'A')], api)
    expect(api.sent).toEqual([['put', 'a', 1, null, 'WMKK']])
    expect(sent).toEqual({ a: 'A' })
  })

  it('sends the map pieces first when the cloud lacks the map', async () => {
    const api = fakeApi()
    await pushSaves('CODE', 'dev', [save('a', 'A')], api)
    expect(api.sent).toEqual([['part', 'a', 0, 'img'], ['put', 'a', 1, null, 'WMKK']])
  })

  it('does nothing, not even asking the cloud, when there are no briefings', async () => {
    const api = fakeApi()
    api.list = async () => { throw new Error('must not list') }
    expect(await pushSaves('CODE', 'dev', [], api)).toEqual({})
  })

  it('lets errors (e.g. 403 not the owner) through', async () => {
    const api = fakeApi({ listError: Object.assign(new Error('owned'), { status: 403 }) })
    await expect(pushSaves('CODE', 'dev', [save('a', 'A')], api)).rejects.toThrow('owned')
  })
})

describe('syncLogsNow', () => {
  it('sends all the duty logs under the sync code, then marks them synced', async () => {
    const markSynced = vi.fn()
    duty.state = { syncCode: 'CODE', logs: [{ id: 'L1' }, { id: 'L2' }], ensureDeviceId: () => 'dev', markSynced }
    duty.pushLogs.mockResolvedValue()
    await syncLogsNow()
    expect(duty.pushLogs).toHaveBeenCalledWith('CODE', [{ id: 'L1' }, { id: 'L2' }], 'dev')
    expect(markSynced).toHaveBeenCalledWith('CODE')
  })

  it('does not mark them synced when the upload fails', async () => {
    const markSynced = vi.fn()
    duty.state = { syncCode: 'CODE', logs: [], ensureDeviceId: () => 'dev', markSynced }
    duty.pushLogs.mockRejectedValue(new Error('offline'))
    await expect(syncLogsNow()).rejects.toThrow('offline')
    expect(markSynced).not.toHaveBeenCalled()
  })

  it('asks for a sync code first when there is none', async () => {
    duty.state = { syncCode: null, logs: [], ensureDeviceId: () => 'dev', markSynced: vi.fn() }
    await expect(syncLogsNow()).rejects.toThrow('sync code')
  })
})

describe('fetchOne', () => {
  it('gets just that briefing, map joined, without claiming the code', async () => {
    const api = fakeApi({ entries: { a: { entry: save('a', 'A', null), mapParts: 2 } }, pieces: { a: ['x', 'y'] } })
    api.claim = async () => { throw new Error('must not claim') }
    expect((await fetchOne('CODE', 'a', api)).mapSnapshot).toBe('xy')
  })
})

describe('fetchOne with the Satellite pictures', () => {
  it('puts the cloud and winds pictures back into the briefing', async () => {
    const entry = withPictures(save('a', 'A', null), { sat: { image: null, at: 1 }, wind: { image: null, at: 2 } })
    const api = fakeApi({
      entries: { a: { entry, mapParts: 1, satParts: 2, windParts: 1 } },
      pieces: { a: Object.assign(['MAP'], { sat: ['S1', 'S2'], wind: ['W1'] }) },
    })
    const out = await fetchOne('CODE', 'a', api)
    expect([out.mapSnapshot, out.satSnapshot.image, out.windSnapshot.image]).toEqual(['MAP', 'S1S2', 'W1'])
    expect([out.satSnapshot.takenAt, out.windSnapshot.fl]).toEqual([1, 340])
  })

  it('a briefing stored before pictures had pieces keeps the picture inside its entry', async () => {
    const entry = withPictures(save('a', 'A', null), { sat: { image: 'INLINE', at: 1 } })
    const api = fakeApi({ entries: { a: { entry, mapParts: 0 } } })
    expect((await fetchOne('CODE', 'a', api)).satSnapshot.image).toBe('INLINE')
  })

  it('sync then fetch gives back the same briefing', async () => {
    const original = withPictures(save('a', 'A', 'm'.repeat(MAP_PIECE_CHARS + 3)), { sat: { image: 's'.repeat(MAP_PIECE_CHARS * 2), at: 1 }, wind: { image: 'w', at: 2 } })
    const store = { parts: {}, entry: null, counts: null }
    const api = fakeApi()
    api.putPart = async (_c, _d, _id, n, data, what = 'map') => { (store.parts[what] ??= [])[n] = data }
    api.put = async (_c, _d, e, mapParts, _row, counts) => { store.entry = e; store.counts = { mapParts, ...counts } }
    await syncSaves('CODE', 'dev', [original], api)
    const back = fakeApi({
      entries: { a: { entry: JSON.parse(JSON.stringify(store.entry)), ...store.counts } },
      pieces: { a: Object.assign(store.parts.map, { sat: store.parts.sat, wind: store.parts.wind }) },
    })
    expect(await fetchOne('CODE', 'a', back)).toEqual(original)
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
