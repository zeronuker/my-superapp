import { describe, it, expect } from 'vitest'
import {
  greatCircleNm,
  interpolateGreatCircle,
  altitudeCorrectionMinutes,
  cabinRelativeQibla,
  buildPrayerTimeline,
} from './flightCalc'

describe('greatCircleNm', () => {
  it('is zero for the same point', () => {
    expect(greatCircleNm(0, 0, 0, 0)).toBeCloseTo(0, 5)
  })
  it('1° of latitude ≈ 60 nm', () => {
    expect(greatCircleNm(0, 0, 1, 0)).toBeCloseTo(60, 1)
  })
  it('1° of longitude at the equator ≈ 60 nm', () => {
    expect(greatCircleNm(0, 0, 0, 1)).toBeCloseTo(60, 1)
  })
})

describe('interpolateGreatCircle', () => {
  it('fraction 0 returns the departure point', () => {
    expect(interpolateGreatCircle(10, 20, 30, 40, 0)).toEqual({ lat: 10, lng: 20 })
  })
  it('fraction 1 returns the destination point', () => {
    expect(interpolateGreatCircle(10, 20, 30, 40, 1)).toEqual({ lat: 30, lng: 40 })
  })
  it('clamps fractions below 0 to departure', () => {
    expect(interpolateGreatCircle(10, 20, 30, 40, -0.5)).toEqual({ lat: 10, lng: 20 })
  })
  it('clamps fractions above 1 to destination', () => {
    expect(interpolateGreatCircle(10, 20, 30, 40, 1.5)).toEqual({ lat: 30, lng: 40 })
  })
  it('midpoint along the equator is roughly halfway', () => {
    const p = interpolateGreatCircle(0, 0, 0, 10, 0.5)
    expect(p.lat).toBeCloseTo(0, 5)
    expect(p.lng).toBeCloseTo(5, 5)
  })
})

describe('altitudeCorrectionMinutes', () => {
  it('is zero at or below sea level', () => {
    expect(altitudeCorrectionMinutes(0)).toBe(0)
    expect(altitudeCorrectionMinutes(-100)).toBe(0)
  })
  it('increases with altitude', () => {
    const low = altitudeCorrectionMinutes(10000)
    const high = altitudeCorrectionMinutes(40000)
    expect(high).toBeGreaterThan(low)
  })
  it('FL350 correction is ~13 minutes', () => {
    expect(altitudeCorrectionMinutes(35000)).toBeCloseTo(13.25, 0)
  })
})

describe('cabinRelativeQibla', () => {
  it('AHEAD when qibla matches heading', () => {
    expect(cabinRelativeQibla(90, 90)).toEqual({ angle: 0, side: 'AHEAD' })
  })
  it('RIGHT when qibla is 90° clockwise of heading', () => {
    expect(cabinRelativeQibla(90, 0)).toEqual({ angle: 90, side: 'RIGHT' })
  })
  it('LEFT when qibla is 90° counter-clockwise of heading', () => {
    expect(cabinRelativeQibla(0, 90)).toEqual({ angle: 90, side: 'LEFT' })
  })
  it('BEHIND when qibla is opposite the heading', () => {
    expect(cabinRelativeQibla(180, 0)).toEqual({ angle: 180, side: 'BEHIND' })
  })
  it('wraps around the 360° boundary', () => {
    // heading 350, qibla 10 → 20° to the right
    expect(cabinRelativeQibla(10, 350)).toEqual({ angle: 20, side: 'RIGHT' })
  })
})

describe('buildPrayerTimeline across the date line', () => {
  const SIN = { lat: 1.3644, lng: 103.9915 }
  const SFO = { lat: 37.6213, lng: -122.379 }
  const KUL = { lat: 2.7456, lng: 101.7099 }
  const LAX = { lat: 33.9416, lng: -118.4085 }
  const settings = { calculationMethod: 'jakim', madhab: 'shafi', timeFormat: '24hr' }

  // Two real prayers are never at the same instant (Imsak and Fajr come about 6 minutes apart in a fast
  // westbound frame). Seven prayers "happening" at one moment is the calendar's day-wrap showing up as a
  // crossing: not real.
  const noPileUp = (events) => {
    for (let i = 1; i < events.length; i++) expect(events[i].elapsedHours - events[i - 1].elapsedHours).toBeGreaterThan(0.02)
  }

  it.each([
    ['SIN-SFO', SIN, SFO, 16.5],
    ['KUL-LAX', KUL, LAX, 14.5],
  ])('%s: no prayers pile up at one moment, at departures that reach the date line', (_n, dep, dest, hours) => {
    for (const h of [0, 9, 15]) {
      const depInstantMs = Date.UTC(2026, 10, 21, h, 0)
      const events = buildPrayerTimeline({ depPos: dep, destPos: dest, depInstantMs, totalHours: hours, altitudeFt: 38000, settings })
      noPileUp(events)
    }
  }, 30_000)

  it('still finds real prayers on an ordinary flight (KUL-SIN, no date line)', () => {
    const events = buildPrayerTimeline({ depPos: KUL, destPos: SIN, depInstantMs: Date.UTC(2026, 10, 21, 3, 0), totalHours: 1, altitudeFt: 30000, settings })
    expect(Array.isArray(events)).toBe(true)
    noPileUp(events)
  })

  it('a long westbound flight still finds its prayers (LHR-like: not emptied by the filter)', () => {
    const events = buildPrayerTimeline({ depPos: { lat: 51.47, lng: -0.45 }, destPos: SIN, depInstantMs: Date.UTC(2026, 10, 21, 20, 0), totalHours: 13, altitudeFt: 38000, settings })
    expect(events.length).toBeGreaterThan(3)
    noPileUp(events)
  })
})

