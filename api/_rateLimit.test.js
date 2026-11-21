import { describe, it, expect } from 'vitest'
import { callerInfo, rateLimited } from './_rateLimit.js'

describe('callerInfo', () => {
  it('gives the country and the start of the browser type', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
    expect(callerInfo({ headers: { 'x-vercel-ip-country': 'MY', 'user-agent': ua } }))
      .toBe(`country=MY ua=${ua.slice(0, 40)}`)
  })
  it('copes with missing headers', () => {
    expect(callerInfo({ headers: {} })).toBe('country=? ua=?')
    expect(callerInfo({})).toBe('country=? ua=?')
  })
  it('never includes an IP address', () => {
    expect(callerInfo({ headers: { 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '203.0.113.9' } })).not.toMatch(/203\.0\.113/)
  })
})

describe('rateLimited', () => {
  const mkRes = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json() { return this } })
  const req = (ip) => ({ headers: { 'x-forwarded-for': ip }, socket: {} })

  it('counts each kind of request separately for the same IP', () => {
    const ip = `kind-${Math.random()}`
    // 21 briefing-sized calls must not use up the duty-log allowance of 20
    for (let i = 0; i < 21; i++) rateLimited(req(ip), mkRes(), { limit: 150, key: 'briefing' })
    const res = mkRes()
    expect(rateLimited(req(ip), res, { limit: 20, key: 'logs' })).toBe(false)
  })

  it('still blocks a kind that goes over its own limit', () => {
    const ip = `over-${Math.random()}`
    const res = mkRes()
    let blocked = false
    for (let i = 0; i < 4; i++) blocked = rateLimited(req(ip), res, { limit: 3, key: 'logs' })
    expect(blocked).toBe(true)
    expect(res.code).toBe(429)
  })
})
