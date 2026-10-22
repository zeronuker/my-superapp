import { describe, it, expect } from 'vitest'
import { zonedDate, dayInZone, formatInZone, fmtClock } from './zonedTime'

describe('zonedDate', () => {
  it('reads the wall clock in the given zone, whatever the device zone is', () => {
    expect(zonedDate('2026-10-22', '05:49', 'Asia/Kuala_Lumpur').toISOString()).toBe('2026-10-21T21:49:00.000Z')
    expect(zonedDate('2026-10-22', '05:49', 'Europe/London').toISOString()).toBe('2026-10-22T04:49:00.000Z') // BST
  })
  it('follows daylight saving', () => {
    expect(zonedDate('2026-03-01', '12:00', 'America/New_York').toISOString()).toBe('2026-03-01T17:00:00.000Z') // EST
    expect(zonedDate('2026-04-01', '12:00', 'America/New_York').toISOString()).toBe('2026-04-01T16:00:00.000Z') // EDT
  })
  it('uses the device zone when the zone is unknown', () => {
    expect(zonedDate('2026-10-22', '05:49').getTime()).toBe(new Date(2026, 9, 22, 5, 49).getTime())
  })
  it('falls back to the device zone for an invalid name', () => {
    expect(() => zonedDate('2026-10-22', '05:49', 'Not/AZone')).not.toThrow()
  })
})

describe('dayInZone / formatInZone', () => {
  const instant = new Date('2026-10-21T21:49:00.000Z')
  it('gives the calendar day in the zone, not UTC', () => {
    expect(dayInZone(instant, 'Asia/Kuala_Lumpur')).toBe('2026-10-22')
    expect(dayInZone(instant, 'America/New_York')).toBe('2026-10-21')
  })
  it('formats the clock in the zone', () => {
    expect(formatInZone(instant, 'Asia/Kuala_Lumpur', '24hr')).toBe('05:49')
    expect(formatInZone(instant, 'Asia/Kuala_Lumpur', '12hr')).toBe('5:49 AM')
    expect(formatInZone(instant, 'America/New_York', '24hr')).toBe('17:49')
    expect(formatInZone(null, 'Asia/Kuala_Lumpur', '24hr')).toBe('--:--')
  })
  it('round-trips with zonedDate', () => {
    expect(formatInZone(zonedDate('2026-10-22', '19:00', 'Asia/Tokyo'), 'Asia/Tokyo', '24hr')).toBe('19:00')
  })
})

describe('fmtClock', () => {
  it('handles midnight and noon in 12hr', () => {
    expect(fmtClock(0, 5, '12hr')).toBe('12:05 AM')
    expect(fmtClock(12, 0, '12hr')).toBe('12:00 PM')
    expect(fmtClock(9, 7, '24hr')).toBe('09:07')
  })
})
