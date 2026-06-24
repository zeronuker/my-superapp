import { describe, it, expect } from 'vitest'
import { relativeTimeFromNow } from './relativeTime'

describe('relativeTimeFromNow', () => {
  const now = 1_700_000_000_000

  it('returns null when there is no timestamp', () => {
    expect(relativeTimeFromNow(null, now)).toBe(null)
    expect(relativeTimeFromNow(undefined, now)).toBe(null)
  })

  it('returns JUST NOW for under 30s', () => {
    expect(relativeTimeFromNow(now - 5_000, now)).toBe('JUST NOW')
  })

  it('returns seconds for under a minute', () => {
    expect(relativeTimeFromNow(now - 45_000, now)).toBe('45 SEC AGO')
  })

  it('returns minutes for under an hour', () => {
    expect(relativeTimeFromNow(now - 2 * 60_000, now)).toBe('2 MIN AGO')
  })

  it('returns hours (singular) for exactly one hour', () => {
    expect(relativeTimeFromNow(now - 60 * 60_000, now)).toBe('1 HR AGO')
  })

  it('returns hours (plural) for multiple hours', () => {
    expect(relativeTimeFromNow(now - 5 * 60 * 60_000, now)).toBe('5 HRS AGO')
  })

  it('returns days for 24h+', () => {
    expect(relativeTimeFromNow(now - 3 * 24 * 60 * 60_000, now)).toBe('3 DAYS AGO')
  })

  it('clamps future timestamps to JUST NOW instead of negative time', () => {
    expect(relativeTimeFromNow(now + 10_000, now)).toBe('JUST NOW')
  })
})
