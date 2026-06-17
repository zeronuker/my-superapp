import { describe, it, expect } from 'vitest'
import { clockToElapsedTotal, getUtcOffsetStr } from './useFlight'

const utc = (h, m = 0) => new Date(Date.UTC(2026, 0, 10, h, m))

describe('clockToElapsedTotal (UTC)', () => {
  it('mid-flight: dep 0900, arr 1700, now 1300 → 4h elapsed / 8h total', () => {
    const r = clockToElapsedTotal('0900', '1700', 'utc', utc(13))
    expect(r.elapsedHours).toBeCloseTo(4, 5)
    expect(r.totalHours).toBeCloseTo(8, 5)
  })

  it('accepts HH:MM and HHMM', () => {
    const r = clockToElapsedTotal('09:00', '17:30', 'utc', utc(12))
    expect(r.totalHours).toBeCloseTo(8.5, 5)
    expect(r.elapsedHours).toBeCloseTo(3, 5)
  })

  it('overnight: dep 2200, arr 0600, now 0200 → 4h elapsed / 8h total', () => {
    const r = clockToElapsedTotal('2200', '0600', 'utc', utc(2))
    expect(r.totalHours).toBeCloseTo(8, 5)
    expect(r.elapsedHours).toBeCloseTo(4, 5)
  })

  it('clamps elapsed to [0, total]', () => {
    // now after arrival → elapsed capped at total
    const r = clockToElapsedTotal('0900', '1100', 'utc', utc(15))
    expect(r.elapsedHours).toBeCloseTo(2, 5)
    expect(r.totalHours).toBeCloseTo(2, 5)
  })

  it('returns null on bad input', () => {
    expect(clockToElapsedTotal('99:99', '1700', 'utc', utc(13))).toBeNull()
    expect(clockToElapsedTotal('', '', 'utc', utc(13))).toBeNull()
  })
})

// now = 05:00 UTC Jan 10, which is 13:00 KL (UTC+8) — mid-flight
const nowMidFlight = new Date('2026-01-10T05:00:00Z')

describe('clockToElapsedTotal (local, tz-aware)', () => {
  it('WMKK→YBBN: 09:30 KL → 20:20 Brisbane = 8h 50m total, 3.5h elapsed', () => {
    // dep: 09:30 KL (UTC+8) = 01:30 UTC
    // arr: 20:20 BNE (UTC+10) = 10:20 UTC
    // now: 05:00 UTC → elapsed = 3.5h
    const r = clockToElapsedTotal(
      '0930', '2020', 'local', nowMidFlight,
      'Asia/Kuala_Lumpur', 'Australia/Brisbane'
    )
    expect(r.totalHours).toBeCloseTo(8 + 50 / 60, 2)
    expect(r.elapsedHours).toBeCloseTo(3.5, 2)
  })

  it('WMKK→OMDB: 0930 KL → 1330 Dubai = 7h total', () => {
    // dep: 09:30 KL (UTC+8) = 01:30 UTC
    // arr: 13:30 Dubai (UTC+4) = 09:30 UTC
    // total = 8h
    const r = clockToElapsedTotal(
      '0930', '1330', 'local', nowMidFlight,
      'Asia/Kuala_Lumpur', 'Asia/Dubai'
    )
    expect(r.totalHours).toBeCloseTo(8, 2)
  })

  it('cross-date overnight: dep 2200 KL → arr 0600 Brisbane = 6h total', () => {
    // dep: 22:00 KL (UTC+8) = 14:00 UTC
    // arr: 06:00 BNE (UTC+10) = 20:00 UTC same day → but 20:00 > 14:00, so no overnight add
    // total = 6h
    const now = new Date('2026-01-10T15:00:00Z') // 15:00 UTC, 1h into flight
    const r = clockToElapsedTotal(
      '2200', '0600', 'local', now,
      'Asia/Kuala_Lumpur', 'Australia/Brisbane'
    )
    expect(r.totalHours).toBeCloseTo(6, 2)
    expect(r.elapsedHours).toBeCloseTo(1, 2)
  })

  it('India half-hour offset: VIDP→EGLL total makes sense', () => {
    // dep: 01:30 Delhi (UTC+5:30) = 20:00 UTC prev day → adjust +24h
    // arr: 07:00 London (UTC+0 in winter) = 07:00 UTC
    // now = 05:00 UTC (in flight)
    const r = clockToElapsedTotal(
      '0130', '0700', 'local', nowMidFlight,
      'Asia/Calcutta', 'Europe/London'
    )
    // 01:30 IST = 20:00 UTC previous day; after +24h adjustment = 20:00 UTC today
    // 07:00 London = 07:00 UTC today; 07:00 < 20:00 → +24h → 07:00 UTC next day
    // total = (07:00 next day) - (20:00 today) = 11h
    expect(r.totalHours).toBeCloseTo(11, 1)
  })

  it('falls back gracefully when tzId absent', () => {
    // Without tz IDs, uses device local time (same as old local behaviour)
    const r = clockToElapsedTotal('0900', '1700', 'local', utc(13))
    expect(r).not.toBeNull()
    expect(r.totalHours).toBeGreaterThan(0)
  })
})

describe('getUtcOffsetStr', () => {
  it('returns a UTC offset string', () => {
    const s = getUtcOffsetStr('Asia/Kuala_Lumpur')
    expect(s).toBe('UTC+8')
  })

  it('handles half-hour offsets', () => {
    const s = getUtcOffsetStr('Asia/Calcutta')
    expect(s).toBe('UTC+5:30')
  })

  it('returns empty string for null', () => {
    expect(getUtcOffsetStr(null)).toBe('')
  })
})
