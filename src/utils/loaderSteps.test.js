import { describe, it, expect } from 'vitest'
import { CLOUD_STEPS, WIND_STEPS, STORM_STEPS, STEP_MS, loaderMs, loaderWaitMs, holdForLoader } from './loaderSteps'

describe('loaderSteps', () => {
  it('has the four chips for each view, in order', () => {
    expect(CLOUD_STEPS.map(s => s.chip)).toEqual(['FETCH IMAGE', 'OVERLAYING ROUTE', 'STITCH', 'DRAWING MAP'])
    expect(WIND_STEPS.map(s => s.chip)).toEqual(['DOWNLOADING WIND DATA', 'DECODING', 'OVERLAYING ROUTE', 'DRAWING MAP'])
  })

  it('has the three chips for the storms view', () => {
    expect(STORM_STEPS.map(s => s.chip)).toEqual(['FETCH STORMS', 'OVERLAYING ROUTE', 'DRAWING MAP'])
  })

  it('lets every step have its turn', () => {
    expect(loaderMs(CLOUD_STEPS)).toBe(4 * STEP_MS)
  })

  it('only waits for what is left of that time', () => {
    const t0 = 1_000_000
    expect(loaderWaitMs(t0, CLOUD_STEPS, t0 + 1000)).toBe(4 * STEP_MS - 1000)
    expect(loaderWaitMs(t0, CLOUD_STEPS, t0 + 60_000)).toBe(0)
  })

  it('does not wait when it is already late, or when cancelled', async () => {
    const t = Date.now()
    await holdForLoader(t - 60_000, CLOUD_STEPS)
    const ctl = new AbortController()
    ctl.abort()
    await holdForLoader(Date.now(), CLOUD_STEPS, ctl.signal)
    expect(Date.now() - t).toBeLessThan(500)
  })

  it('stops waiting when cancelled part-way', async () => {
    const ctl = new AbortController()
    const t = Date.now()
    setTimeout(() => ctl.abort(), 30)
    await holdForLoader(Date.now(), WIND_STEPS, ctl.signal)
    expect(Date.now() - t).toBeLessThan(1000)
  })
})
