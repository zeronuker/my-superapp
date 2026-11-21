import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from './weather.js'

function call(query) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
  return handler({ query, headers: {}, socket: { remoteAddress: `test-${Math.random()}` } }, res).then(() => res)
}

describe('weather handler', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answers an empty list, not an error, when the source says it has no report (204)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } })))
    const res = await call({ ids: 'WXYZ', type: 'metar' })
    expect(res.code).toBe(200)
    expect(res.body).toEqual([])
  })

  it('still reports a real source failure as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'x' }) })))
    expect((await call({ ids: 'WMKK', type: 'metar' })).code).toBe(502)
  })

  it('passes a normal report through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ icaoId: 'WMKK' }] })))
    const res = await call({ ids: 'WMKK', type: 'metar' })
    expect(res.code).toBe(200)
    expect(res.body).toEqual([{ icaoId: 'WMKK' }])
  })
})
