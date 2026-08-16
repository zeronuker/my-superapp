import { describe, it, expect } from 'vitest'
import { ROLE_TINT } from './roleStyle'

describe('ROLE_TINT', () => {
  it('defines every role used by NotamViewer and METARTAFCalculator', () => {
    expect(Object.keys(ROLE_TINT).sort()).toEqual(
      ['arr', 'dep', 'destalt', 'era', 'fir', 'other'].sort(),
    )
  })

  it('every entry has a color and a soft background tint', () => {
    for (const [role, entry] of Object.entries(ROLE_TINT)) {
      expect(entry.color, `${role}.color`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(entry.soft, `${role}.soft`).toMatch(/^rgba\(/)
    }
  })

  it('dep and arr share the same color (cyan)', () => {
    expect(ROLE_TINT.dep.color).toBe(ROLE_TINT.arr.color)
  })
})
