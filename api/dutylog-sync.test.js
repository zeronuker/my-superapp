import { describe, it, expect, vi, beforeEach } from 'vitest'

// A stand-in for Firestore: every document in one Map, keyed by its full path.
const fb = vi.hoisted(() => {
  const docs = new Map()
  const docRef = (path) => ({
    get: async () => { const d = docs.get(path); return { exists: d !== undefined, id: path.split('/').pop(), data: () => d } },
    set: async (v) => { docs.set(path, v) },
    delete: async () => { docs.delete(path) },
    collection: (name) => collRef(`${path}/${name}`),
  })
  const collRef = (path) => ({
    doc: (id) => docRef(`${path}/${id}`),
    select: () => ({
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
          .map(([p, v]) => ({ id: p.split('/').pop(), data: () => ({ name: v.name, savedAt: v.savedAt, mapParts: v.mapParts, row: v.row }) })),
      }),
    }),
  })
  return { docs, db: { collection: (name) => collRef(name) } }
})
vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: () => ({}), cert: (c) => c }))
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fb.db }))

import handler from './dutylog-sync.js'

const CODE = 'ABCD-EFGH-JKMN'
const entry = (id, name = id) => ({ id, name, savedAt: 5, route: { pts: [[1, 2]] }, mapSnapshot: 'img' })

function call(method, { query = {}, body } = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
  const req = { method, headers: { 'x-forwarded-for': `ip-${Math.random()}` }, query: { code: CODE, kind: 'briefing', ...query }, body }
  return handler(req, res).then(() => res)
}

beforeEach(() => { fb.docs.clear() })

describe('briefing endpoints', () => {
  it('PUT creates the code with an owner, GET lists and fetches (nested arrays survive)', async () => {
    expect((await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', entry: entry('a', 'Alpha') } })).code).toBe(200)
    expect(fb.docs.get(`dutylogs/${CODE}`).ownerDeviceId).toBe('dev1')

    expect((await call('GET')).body).toEqual({ items: [{ id: 'a', name: 'Alpha', savedAt: 5, mapParts: 0, row: null }] })
    expect((await call('GET', { query: { id: 'a' } })).body.entry).toEqual(entry('a', 'Alpha'))
  })

  it('refuses a device that is not the owner', async () => {
    await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', entry: entry('a') } })
    expect((await call('PUT', { query: { id: 'b' }, body: { deviceId: 'dev2', entry: entry('b') } })).code).toBe(403)
    expect((await call('DELETE', { query: { id: 'a', deviceId: 'dev2' } })).code).toBe(403)
    expect(fb.docs.has(`dutylogs/${CODE}/briefings/a`)).toBe(true)
  })

  it('DELETE by the owner removes it; POST transfers ownership and lists', async () => {
    await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', entry: entry('a') } })
    await call('PUT', { query: { id: 'b' }, body: { deviceId: 'dev1', entry: entry('b') } })
    expect((await call('DELETE', { query: { id: 'a', deviceId: 'dev1' } })).code).toBe(200)

    const claim = await call('POST', { body: { deviceId: 'dev2' } })
    expect(claim.body.items.map(i => i.id)).toEqual(['b'])
    expect(fb.docs.get(`dutylogs/${CODE}`).ownerDeviceId).toBe('dev2')
  })

  it('shares the code with the duty logs without touching them', async () => {
    fb.docs.set(`dutylogs/${CODE}`, { logs: [{ id: 'L' }], updatedAt: 1, ownerDeviceId: 'dev1' })
    await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', entry: entry('a') } })
    expect(fb.docs.get(`dutylogs/${CODE}`).logs).toEqual([{ id: 'L' }])
  })

  it('keeps a map picture bigger than one document in pieces and gives it back whole', async () => {
    const pieces = ['a'.repeat(700_000), 'b'.repeat(700_000), 'c'.repeat(10)]
    for (const [n, data] of pieces.entries()) {
      expect((await call('PUT', { query: { id: 'a', part: String(n) }, body: { deviceId: 'dev1', data } })).code).toBe(200)
    }
    await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', mapParts: 3, entry: { ...entry('a'), mapSnapshot: null } } })

    expect((await call('GET')).body.items).toEqual([{ id: 'a', name: 'a', savedAt: 5, mapParts: 3, row: null }])
    const got = (await call('GET', { query: { id: 'a' } })).body
    expect(got.mapParts).toBe(3)
    const back = []
    for (let n = 0; n < got.mapParts; n++) back.push((await call('GET', { query: { id: 'a', part: String(n) } })).body.data)
    expect(back).toEqual(pieces)
  })

  it('deleting a briefing deletes its map pieces; pieces obey the owner and size rules', async () => {
    await call('PUT', { query: { id: 'a', part: '0' }, body: { deviceId: 'dev1', data: 'img' } })
    await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', mapParts: 1, entry: entry('a') } })
    expect((await call('PUT', { query: { id: 'a', part: '1' }, body: { deviceId: 'dev2', data: 'x' } })).code).toBe(403)
    expect((await call('PUT', { query: { id: 'a', part: '1' }, body: { deviceId: 'dev1', data: 'x'.repeat(950_000) } })).code).toBe(413)
    expect((await call('PUT', { query: { id: 'a', part: '99' }, body: { deviceId: 'dev1', data: 'x' } })).code).toBe(400)

    await call('DELETE', { query: { id: 'a', deviceId: 'dev1' } })
    expect([...fb.docs.keys()].filter(k => k.includes('/briefings/'))).toEqual([])
  })

  it('lists the row summary stored with each briefing, and refuses a bad one', async () => {
    const row = { flight: 'MH1', dep: 'WMKK', arr: 'WSSS', isOfp: true }
    await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', mapParts: 0, row, entry: entry('a', 'Alpha') } })
    expect((await call('GET')).body.items[0].row).toEqual(row)
    expect((await call('PUT', { query: { id: 'b' }, body: { deviceId: 'dev1', row: [1], entry: entry('b') } })).code).toBe(400)
    expect((await call('PUT', { query: { id: 'b' }, body: { deviceId: 'dev1', row: { x: 'y'.repeat(2500) }, entry: entry('b') } })).code).toBe(400)
  })

  it('rejects a mismatched entry, a bad id, an oversize briefing and an unknown code', async () => {
    expect((await call('PUT', { query: { id: 'a' }, body: { deviceId: 'd', entry: entry('zzz') } })).code).toBe(400)
    expect((await call('GET', { query: { id: '../x' } })).code).toBe(400)
    const big = { ...entry('a'), mapSnapshot: 'x'.repeat(950_000) }
    expect((await call('PUT', { query: { id: 'a' }, body: { deviceId: 'd', entry: big } })).code).toBe(413)
    expect((await call('GET')).code).toBe(404)
  })
})
