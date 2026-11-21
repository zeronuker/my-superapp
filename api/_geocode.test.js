import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from './geocode.js'

function call(query) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
  return handler({ query, headers: {}, socket: { remoteAddress: `test-${Math.random()}` } }, res).then(() => res)
}

describe('geocode handler', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a reverse lookup whose lat/lng are not plain numbers, without calling out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const q of [
      { type: 'reverse', lat: '3.1&format=xml&zoom=3', lng: '101.6' },
      { type: 'reverse', lat: '3.1', lng: 'abc' },
      { type: 'reverse', lat: '91', lng: '101.6' },
      { type: 'reverse', lat: '3.1', lng: '181' },
      { type: 'reverse', lat: ['3.1', '4'], lng: '101.6' },
    ]) {
      const res = await call(q)
      expect(res.code).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still answers a normal reverse lookup', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ address: { city: 'KL' } }) }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await call({ type: 'reverse', lat: '3.139', lng: '-101.6869' })
    expect(res.code).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toContain('lat=3.139&lon=-101.6869&')
  })
})
