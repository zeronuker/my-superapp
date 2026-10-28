import { describe, it, expect } from 'vitest'
import { altDateText } from './dateSearch'

describe('altDateText', () => {
  it('returns an empty string for no date', () => {
    expect(altDateText('')).toBe('')
    expect(altDateText(undefined)).toBe('')
  })

  it('includes day, short month, full month and year', () => {
    expect(altDateText('2026-09-05')).toBe('05 SEP 2026 SEPTEMBER 2026')
  })
})
