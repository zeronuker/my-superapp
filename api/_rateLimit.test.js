import { describe, it, expect } from 'vitest'
import { callerInfo } from './_rateLimit.js'

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
