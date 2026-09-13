import { describe, it, expect } from 'vitest'
import { formatHHMM } from './formatHHMM'

describe('formatHHMM', () => {
  it('leaves short digit strings unformatted', () => {
    expect(formatHHMM('1')).toBe('1')
    expect(formatHHMM('12')).toBe('12')
  })

  it('inserts a colon after the second digit', () => {
    expect(formatHHMM('123')).toBe('12:3')
    expect(formatHHMM('1234')).toBe('12:34')
  })

  it('formats an already-colon-formatted value the same way', () => {
    expect(formatHHMM('12:34')).toBe('12:34')
  })

  it('strips non-digit characters', () => {
    expect(formatHHMM('12ab34')).toBe('12:34')
  })

  it('caps at 4 digits', () => {
    expect(formatHHMM('123456')).toBe('12:34')
  })

  it('handles empty or missing values', () => {
    expect(formatHHMM('')).toBe('')
    expect(formatHHMM(undefined)).toBe('')
    expect(formatHHMM(null)).toBe('')
  })
})
