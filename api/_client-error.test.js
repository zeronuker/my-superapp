import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from './client-error.js'

function call({ body, type = 'application/json', method = 'POST' }) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } }
  const req = { method, body, headers: { 'content-type': type }, socket: { remoteAddress: `test-${Math.random()}` } }
  return handler(req, res).then(() => res)
}

afterEach(() => vi.restoreAllMocks())

describe('client-error', () => {
  it('logs a tab crash as before', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call({ body: { tab: 'Briefing', message: 'boom' } })
    expect(res.code).toBe(204)
    expect(log.mock.calls[0][0]).toBe('[client-error]')
  })

  it.each([
    ['an object', { 'csp-report': { 'blocked-uri': 'https://evil.example/x.js', 'violated-directive': 'script-src' } }],
    ['text', JSON.stringify({ 'csp-report': { 'blocked-uri': 'https://evil.example/x.js' } })],
    ['bytes', Buffer.from(JSON.stringify({ 'csp-report': { 'blocked-uri': 'https://evil.example/x.js' } }))],
  ])('logs a browser CSP report sent as %s', async (_n, body) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call({ body, type: 'application/csp-report' })
    expect(res.code).toBe(204)
    expect(log.mock.calls[0][0]).toBe('[csp-report]')
    expect(log.mock.calls[0][1]).toContain('evil.example')
  })

  it('keeps a very long report short', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await call({ body: 'x'.repeat(50_000), type: 'application/csp-report' })
    expect(log.mock.calls[0][1].length).toBeLessThanOrEqual(1500)
  })

  it('still refuses other methods', async () => {
    expect((await call({ method: 'GET' })).code).toBe(405)
  })
})
