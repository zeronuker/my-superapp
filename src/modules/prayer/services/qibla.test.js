import { describe, it, expect } from 'vitest'
import { qiblaBearing } from './qibla'

describe('qiblaBearing', () => {
  it('returns a bearing in the 0–360° range', () => {
    const b = qiblaBearing(3.139, 101.6869) // Kuala Lumpur
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })

  it('points roughly WNW (~293°) from Kuala Lumpur (east of Mecca)', () => {
    const b = qiblaBearing(3.139, 101.6869)
    expect(b).toBeGreaterThan(290)
    expect(b).toBeLessThan(295)
  })

  it('points roughly NE (~58°) from New York (west of Mecca)', () => {
    const b = qiblaBearing(40.7128, -74.0060)
    expect(b).toBeGreaterThan(50)
    expect(b).toBeLessThan(70)
  })
})
