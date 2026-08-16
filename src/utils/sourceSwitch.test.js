import { describe, it, expect } from 'vitest'
import { isSkyLinkDay } from './sourceSwitch'

describe('isSkyLinkDay', () => {
  it('is true on an even UTC date', () => {
    expect(isSkyLinkDay(new Date('2026-08-12T00:00:00Z'))).toBe(true)
  })
  it('is false on an odd UTC date', () => {
    expect(isSkyLinkDay(new Date('2026-08-13T00:00:00Z'))).toBe(false)
  })
  it('uses the UTC date, not local time', () => {
    // 2026-08-13T23:30Z is still the 13th (odd) in UTC even though it may
    // already be the 14th in a positive-offset local timezone.
    expect(isSkyLinkDay(new Date('2026-08-13T23:30:00Z'))).toBe(false)
  })
  it('defaults to the current date when called with no argument', () => {
    expect(typeof isSkyLinkDay()).toBe('boolean')
  })
})
