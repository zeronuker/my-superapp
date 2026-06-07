import { describe, it, expect } from 'vitest'
import {
  greatCircleNm,
  interpolateGreatCircle,
  altitudeCorrectionMinutes,
  cabinRelativeQibla,
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
