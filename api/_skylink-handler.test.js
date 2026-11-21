import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from './skylink.js'

function call(query) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
  return handler({ query, headers: {}, socket: { remoteAddress: `test-${Math.random()}` } }, res).then(() => res)
}

describe('skylink handler', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('refuses names that only exist on Object.prototype, without calling out', async () => {
    vi.stubEnv('SKYLINK_API_KEY', 'secret')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const resource of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const res = await call({ resource, path: '.evil.example/x' })
      expect(res.code).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still serves a real resource', async () => {
    vi.stubEnv('SKYLINK_API_KEY', 'secret')
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ raw: 'METAR WMKK' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await call({ resource: 'metar', icao: 'wmkk' })
    expect(res.code).toBe(200)
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/skylink-api\.p\.rapidapi\.com\/weather\/metar\/WMKK/)
  })
})
