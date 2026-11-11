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
    select: (...fields) => ({
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
          .map(([p, v]) => ({ id: p.split('/').pop(), data: () => Object.fromEntries(fields.map(f => [f, v[f]])) })),
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

function call(method, { query = {}, body, origin } = {}) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
  const req = { method, headers: { 'x-forwarded-for': `ip-${Math.random()}`, origin }, query: { code: CODE, kind: 'briefing', ...query }, body }
  return handler(req, res).then(() => res)
}

beforeEach(() => { fb.docs.clear() })

describe('briefing endpoints', () => {
  it('PUT creates the code with an owner, GET lists and fetches (nested arrays survive)', async () => {
    expect((await call('PUT', { query: { id: 'a' }, body: { deviceId: 'dev1', entry: entry('a', 'Alpha') } })).code).toBe(200)
    expect(fb.docs.get(`dutylogs/${CODE}`).ownerDeviceId).toBe('dev1')

    expect((await call('GET')).body).toEqual({ items: [{ id: 'a', name: 'Alpha', savedAt: 5, mapParts: 0, satParts: 0, windParts: 0, row: null }] })
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

    expect((await call('GET')).body.items).toEqual([{ id: 'a', name: 'a', savedAt: 5, mapParts: 3, satParts: 0, windParts: 0, row: null }])
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

describe('OFP inbox (kind=ofp)', () => {
  const CVR = 'https://cvr.batikair.com.my'
  const ofp = (method, query = {}, extra = {}) => call(method, { query: { kind: 'ofp', ...query }, ...extra })
  beforeEach(() => { fb.docs.set(`dutylogs/${CODE}`, { logs: [], updatedAt: 1, ownerDeviceId: 'dev1' }) })

  it('the CVR site posts an OFP; the app lists it (newest first), fetches it and deletes it', async () => {
    const sent = await ofp('POST', { id: 'OD1703-2026-11-07-TWU-BKI', label: 'OD1703 TWU-BKI 07NOV' }, { body: '<FlightPlan/>', origin: CVR })
    expect(sent.code).toBe(200)
    expect(sent.headers['Access-Control-Allow-Origin']).toBe(CVR)
    await new Promise(r => setTimeout(r, 2))
    await ofp('POST', { id: 'OD1704', label: 'OD1704' }, { body: 'x' })

    const items = (await ofp('GET')).body.items
    expect(items.map(i => i.id)).toEqual(['OD1704', 'OD1703-2026-11-07-TWU-BKI'])
    expect(items[1]).toEqual({ id: 'OD1703-2026-11-07-TWU-BKI', label: 'OD1703 TWU-BKI 07NOV', sentAt: expect.any(Number) })
    expect((await ofp('GET', { id: 'OD1703-2026-11-07-TWU-BKI' })).body.text).toBe('<FlightPlan/>')

    expect((await ofp('DELETE', { id: 'OD1704' })).code).toBe(200)
    expect((await ofp('GET')).body.items.map(i => i.id)).toEqual(['OD1703-2026-11-07-TWU-BKI'])
  })

  it('leaves the duty logs and briefings alone, and gives the CVR site no access to anything else', async () => {
    await ofp('POST', { id: 'a' }, { body: 'x' })
    expect(fb.docs.get(`dutylogs/${CODE}`).logs).toEqual([])
    expect((await call('GET', { origin: CVR })).headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('refuses an unknown code, a missing or bad id, an empty or oversize OFP', async () => {
    fb.docs.clear()
    expect((await ofp('POST', { id: 'a' }, { body: 'x' })).code).toBe(404)
    fb.docs.set(`dutylogs/${CODE}`, { logs: [] })
    expect((await ofp('POST', {}, { body: 'x' })).code).toBe(400)
    expect((await ofp('POST', { id: '../x' }, { body: 'x' })).code).toBe(400)
    expect((await ofp('POST', { id: 'a' }, { body: '' })).code).toBe(400)
    expect((await ofp('POST', { id: 'a' }, { body: 'x'.repeat(4_100_000) })).code).toBe(413)
    expect((await ofp('GET', { id: 'nope' })).code).toBe(404)
  })

  it('stores an OFP gzipped, so one bigger than a document still fits and comes back whole', async () => {
    const big = '<FlightPlan>' + Array.from({ length: 30_000 }, (_, n) => `<Waypoint id="${n}" name="FIX${n}"/>`).join('') + 'é</FlightPlan>'
    expect(big.length).toBeGreaterThan(1_000_000)
    expect((await ofp('POST', { id: 'long' }, { body: big })).code).toBe(200)
    expect(fb.docs.get(`dutylogs/${CODE}/ofps/long`).gz.length).toBeLessThan(900_000)
    expect((await ofp('GET', { id: 'long' })).body.text).toBe(big)
  })

  it('still reads an OFP stored before they were gzipped', async () => {
    fb.docs.set(`dutylogs/${CODE}/ofps/old`, { text: '<FlightPlan/>', label: 'OD1', sentAt: 1 })
    expect((await ofp('GET', { id: 'old' })).body.text).toBe('<FlightPlan/>')
  })
})

describe('picture pieces: map, cloud (sat) and winds (wind)', () => {
  const put = (query, body) => call('PUT', { query: { id: 'a', ...query }, body: { deviceId: 'dev1', ...body } })

  it('keeps each picture in its own pieces and gives all three back whole', async () => {
    const maps = ['m'.repeat(700_000), 'M'.repeat(5)]
    const sats = ['s'.repeat(700_000), 'S'.repeat(300_000)]
    const winds = ['w'.repeat(300_000)]
    for (const [n, data] of maps.entries()) expect((await put({ part: String(n) }, { data })).code).toBe(200)
    for (const [n, data] of sats.entries()) expect((await put({ part: String(n), what: 'sat' }, { data })).code).toBe(200)
    for (const [n, data] of winds.entries()) expect((await put({ part: String(n), what: 'wind' }, { data })).code).toBe(200)
    expect((await put({}, { mapParts: 2, satParts: 2, windParts: 1, entry: { ...entry('a'), mapSnapshot: null } })).code).toBe(200)

    expect((await call('GET')).body.items).toEqual([{ id: 'a', name: 'a', savedAt: 5, mapParts: 2, satParts: 2, windParts: 1, row: null }])
    const got = (await call('GET', { query: { id: 'a' } })).body
    expect([got.mapParts, got.satParts, got.windParts]).toEqual([2, 2, 1])
    const piece = async (what, n) => (await call('GET', { query: { id: 'a', part: String(n), ...(what ? { what } : {}) } })).body.data
    expect([await piece(undefined, 0), await piece(undefined, 1)]).toEqual(maps)
    expect([await piece('sat', 0), await piece('sat', 1)]).toEqual(sats)
    expect([await piece('wind', 0)]).toEqual(winds)
  })

  it('stores map pieces where they always were, and the others under their own names', async () => {
    await put({ part: '0' }, { data: 'm' })
    await put({ part: '0', what: 'sat' }, { data: 's' })
    await put({ part: '0', what: 'wind' }, { data: 'w' })
    const base = `dutylogs/${CODE}/briefings/a/parts`
    expect([...fb.docs.keys()].filter(k => k.startsWith(base)).sort()).toEqual([`${base}/0`, `${base}/sat-0`, `${base}/wind-0`])
  })

  it('refuses a picture kind it does not know, a piece number past the limit, and the wrong owner', async () => {
    expect((await put({ part: '0', what: 'sky' }, { data: 'x' })).code).toBe(400)
    expect((await put({ part: '10', what: 'sat' }, { data: 'x' })).code).toBe(400)
    expect((await put({ part: '10', what: 'wind' }, { data: 'x' })).code).toBe(400)
    expect((await put({ part: '49' }, { data: 'x' })).code).toBe(200)
    expect((await call('PUT', { query: { id: 'a', part: '0', what: 'sat' }, body: { deviceId: 'dev2', data: 'x' } })).code).toBe(403)
    expect((await put({ part: '0', what: 'sat' }, { data: 'x'.repeat(950_000) })).code).toBe(413)
  })

  it('refuses counts that are out of range', async () => {
    expect((await put({}, { satParts: 11, entry: entry('a') })).code).toBe(400)
    expect((await put({}, { windParts: -1, entry: entry('a') })).code).toBe(400)
    expect((await put({}, { mapParts: 51, entry: entry('a') })).code).toBe(400)
  })

  it('deletes every kind of piece with the briefing', async () => {
    await put({ part: '0' }, { data: 'm' })
    await put({ part: '0', what: 'sat' }, { data: 's' })
    await put({ part: '0', what: 'wind' }, { data: 'w' })
    await put({}, { mapParts: 1, satParts: 1, windParts: 1, entry: entry('a') })
    expect((await call('DELETE', { query: { id: 'a', deviceId: 'dev1' } })).code).toBe(200)
    expect([...fb.docs.keys()].filter(k => k.includes('/briefings/'))).toEqual([])
  })

  it('still reads a briefing stored before pictures had pieces (counts default to 0)', async () => {
    fb.docs.set(`dutylogs/${CODE}`, { logs: [], updatedAt: 1, ownerDeviceId: 'dev1' })
    fb.docs.set(`dutylogs/${CODE}/briefings/old`, { name: 'Old', savedAt: 1, json: JSON.stringify(entry('old', 'Old')), mapParts: 1, row: null })
    const got = (await call('GET', { query: { id: 'old' } })).body
    expect([got.mapParts, got.satParts, got.windParts]).toEqual([1, 0, 0])
    expect(got.entry.id).toBe('old')
  })
})
