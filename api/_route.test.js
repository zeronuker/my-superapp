import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./_autorouterToken.js', () => ({
  getToken: vi.fn(async () => 'TOKEN'),
  invalidateToken: vi.fn(),
}))

import handler from './route.js'
import { getToken, invalidateToken } from './_autorouterToken.js'

const fakeRes = () => {
  const res = { headers: {}, code: 200, body: null }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.status = (c) => { res.code = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const call = async (query) => {
  const res = fakeRes()
  await handler({ query, headers: {}, socket: { remoteAddress: 'test' } }, res)
  return res
}
const reply = (body, status = 200) => ({
  ok: status < 400, status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

// A real-shaped autorouter reply: airport, two fixes, airport.
const plan = (names) => ({
  fplan: names.map(([name, type, lat, lon]) => ({ name, type, coordlatdeg: lat, coordlondeg: lon })),
})
const WMSA_WMKP = plan([['SUBANG', 'ARPT', 3.13, 101.55], ['ATIMU', 'INT', 3.72, 101.02], ['TEPUS', 'INT', 4.2, 100.8], ['PENANG', 'ARPT', 5.3, 100.28]])

beforeEach(() => { vi.clearAllMocks(); getToken.mockResolvedValue('TOKEN') })
afterEach(() => vi.unstubAllGlobals())

describe('/api/route input checks', () => {
  it('rejects a bad airport', async () => {
    expect((await call({ dep: 'WMK', arr: 'WSSS', fixes: 'ATIMU' })).code).toBe(400)
    expect((await call({ dep: 'WMKK', arr: 'W5SS', fixes: 'ATIMU' })).code).toBe(400)
  })
  it('needs at least one fix', async () => {
    expect((await call({ dep: 'WMKK', arr: 'WSSS' })).code).toBe(400)
  })
  it('rejects a fix that is not 2-5 letters (no flight-plan text injection)', async () => {
    expect((await call({ dep: 'WMKK', arr: 'WSSS', fixes: 'ATIMU)-X' })).code).toBe(400)
    expect((await call({ dep: 'WMKK', arr: 'WSSS', fixes: 'AB1' })).code).toBe(400)
    expect((await call({ dep: 'WMKK', arr: 'WSSS', fixes: 'TOOLONG' })).code).toBe(400)
  })
  it('rejects too many fixes', async () => {
    const many = Array.from({ length: 61 }, (_, i) => 'AB' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26)) + 'X').join(',')
    expect((await call({ dep: 'WMKK', arr: 'WSSS', fixes: many })).code).toBe(400)
  })
})

describe('/api/route lookup', () => {
  it('returns the fixes in order, cached for a day', async () => {
    const f = vi.fn(async () => reply(WMSA_WMKP))
    vi.stubGlobal('fetch', f)

    const res = await call({ dep: 'wmsa', arr: 'wmkp', fixes: 'atimu,tepus' })

    expect(res.code).toBe(200)
    expect(res.body.fixes).toEqual([
      { name: 'ATIMU', lat: 3.72, lon: 101.02 },
      { name: 'TEPUS', lat: 4.2, lon: 100.8 },
    ])
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=86400/)
    // the flight plan is built from the validated fields only, and only parsed
    const sent = JSON.parse(f.mock.calls[0][1].body).fpl
    expect(sent).toContain('-WMSA0020')
    expect(sent).toContain('ATIMU DCT TEPUS')
    expect(String(f.mock.calls[0][0])).toBe('https://api.autorouter.aero/v1.0/flightplan')
    expect(f.mock.calls[0][1].method).toBe('POST')
  })

  it('marks fixes autorouter does not know as missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ ...WMSA_WMKP, error: ['unknown identifier GORVU'] })))
    const res = await call({ dep: 'WMSA', arr: 'WMKP', fixes: 'ATIMU,TEPUS,GORVU' })
    expect(res.code).toBe(200)
    expect(res.body.fixes[2]).toEqual({ name: 'GORVU', missing: true })
  })

  it('logs in again once after a 401', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(reply({}, 401))
      .mockResolvedValueOnce(reply(WMSA_WMKP))
    vi.stubGlobal('fetch', f)
    getToken.mockResolvedValueOnce('OLD').mockResolvedValueOnce('NEW')

    const res = await call({ dep: 'WMSA', arr: 'WMKP', fixes: 'ATIMU,TEPUS' })

    expect(res.code).toBe(200)
    expect(invalidateToken).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer OLD')
    expect(f.mock.calls[1][1].headers.Authorization).toBe('Bearer NEW')
  })

  it('answers 502 rather than guess when the reply cannot be matched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(WMSA_WMKP)))
    const res = await call({ dep: 'WMSA', arr: 'WMKP', fixes: 'ATIMU,TEPUS,EXTRA' })
    expect(res.code).toBe(502)
  })

  it('passes an upstream error status through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: 'x' }, 500)))
    expect((await call({ dep: 'WMSA', arr: 'WMKP', fixes: 'ATIMU' })).code).toBe(500)
  })

  it('says so when the autorouter login limit is reached', async () => {
    getToken.mockRejectedValueOnce(new Error('autorouter login limit reached (too many active tokens)'))
    const res = await call({ dep: 'WMSA', arr: 'WMKP', fixes: 'ATIMU' })
    expect(res.code).toBe(503)
    expect(res.body.error).toMatch(/too many active tokens/)
  })
})
